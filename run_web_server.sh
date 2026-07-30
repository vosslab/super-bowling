#!/usr/bin/env bash
# run_web_server.sh - local dev preview for the GitHub Pages build.
#
# Front door: run this directly as ./run_web_server.sh. It is the interface
# for everyone, no npm knowledge required. The npm run serve alias is an
# optional mirror that points right back at this script.
#
# Always serves dist/ (the GitHub Pages artifact). Never serves the
# repo root or _site/.
#
# Lifecycle: this script owns the http.server child, its delayed browser-open
# helper, and a watchdog. WEB_SERVER_MAX_LIFETIME_SECONDS bounds every preview
# session; it defaults to 600 seconds and accepts a positive whole-second
# override. The watchdog stops only this script's server child, so a parent
# shell transport interruption still releases the local port by the deadline.
# EXIT, INT, TERM, and HUP run immediate idempotent cleanup and preserve the
# triggering exit status. SIGKILL remains an inherent shell limit; the watchdog
# supplies the bounded port-release path in that case.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Initialize owned-PID vars BEFORE installing the trap so cleanup is
# safe under set -u even if it fires before the server starts (e.g. a
# setup or build failure).
server_pid=""
opener_pid=""
watchdog_pid=""
timeout_marker=""

# A generous bounded lifetime keeps preview sessions available for the complete
# headless suite while guaranteeing that an interrupted caller eventually
# releases its local port. The explicit name makes CI or diagnostic overrides
# easy to discover.
WEB_SERVER_MAX_LIFETIME_SECONDS="${WEB_SERVER_MAX_LIFETIME_SECONDS:-600}"
if ! [[ "${WEB_SERVER_MAX_LIFETIME_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
	echo "WEB_SERVER_MAX_LIFETIME_SECONDS must be a positive whole number of seconds." >&2
	exit 2
fi

# The marker lets the parent report the conventional timeout status after its
# wait returns from the watchdog's TERM. It is created under the repository's
# ignored local diagnostics directory and removed by normal cleanup.
mkdir -p tmp
timeout_marker="$(mktemp tmp/run_web_server_timeout.XXXXXX)"
rm -f "${timeout_marker}"

#============================================
# Idempotent, exit-status-preserving cleanup. Kills only the PIDs this
# script started, and only if they are still live.
cleanup() {
	# Capture the triggering exit status as the very first action.
	local status=$?
	# Clear the trap so this runs exactly once (idempotent on re-entry).
	trap - EXIT INT TERM HUP
	# Kill the browser-open helper first, only if still alive. An
	# already-dead helper is normal, not an error.
	if [ -n "${opener_pid}" ] && kill -0 "${opener_pid}" 2>/dev/null; then
		kill "${opener_pid}" 2>/dev/null || true
	fi
	# Stop the watchdog and its sleep child before stopping the server. The
	# watchdog trap owns its sleep PID, so this releases the complete helper.
	if [ -n "${watchdog_pid}" ] && kill -0 "${watchdog_pid}" 2>/dev/null; then
		kill "${watchdog_pid}" 2>/dev/null || true
	fi
	# Kill the server child, only if still alive.
	if [ -n "${server_pid}" ] && kill -0 "${server_pid}" 2>/dev/null; then
		kill "${server_pid}" 2>/dev/null || true
	fi
	if [ -n "${timeout_marker}" ]; then
		rm -f "${timeout_marker}"
	fi
	# Preserve the real exit status so failures are not masked.
	exit "${status}"
}
# HUP covers the tool-shell-termination case.
trap cleanup EXIT INT TERM HUP

# Auto-install dependencies on missing node_modules.
if [ ! -d node_modules ]; then
	if [ -f devel/setup_typescript.sh ]; then
		echo "node_modules missing. Running devel/setup_typescript.sh ..." >&2
		bash devel/setup_typescript.sh
	else
		echo "node_modules missing and devel/setup_typescript.sh not found." >&2
		echo "Install dependencies (npm install) or restore the setup script." >&2
		exit 1
	fi
fi

# Random port per session: each port is its own browser origin, so the
# cache is effectively invalidated every run. PORT env var overrides.
PORT="${PORT:-$((8000 + RANDOM % 1000))}"

# Build the GitHub Pages artifact into dist/ (no args; contract is stable).
./build_github_pages.sh

# Open the browser after a short delay when interactive. Capture the
# helper subshell PID so cleanup can kill only this helper, never the
# browser or the opened app.
if command -v open >/dev/null 2>&1 && [ -t 0 ]; then
	(sleep 1 && open "http://localhost:${PORT}/") &
	opener_pid=$!
fi

# Start the server in the background to capture its PID, then wait on it
# to hold the foreground. Capturing wait's status (rather than masking
# it with || true) lets a genuine server startup/exit failure surface,
# while a trap-initiated kill is treated as a clean shutdown.
source source_me.sh
python3 -m http.server "${PORT}" --directory dist &
server_pid=$!

# Start one watchdog for this server PID. The watchdog records its own timeout
# before terminating only the child that this script created. If a transport
# kills the parent shell without delivering a trappable signal, the watchdog
# still reaches this child and releases the port at the configured deadline.
(
	sleep_pid=""
	watchdog_cleanup() {
		local watchdog_status=$?
		trap - EXIT INT TERM HUP
		if [ -n "${sleep_pid}" ] && kill -0 "${sleep_pid}" 2>/dev/null; then
			kill "${sleep_pid}" 2>/dev/null || true
		fi
		exit "${watchdog_status}"
	}
	trap watchdog_cleanup EXIT INT TERM HUP
	sleep "${WEB_SERVER_MAX_LIFETIME_SECONDS}" &
	sleep_pid=$!
	wait "${sleep_pid}"
	if kill -0 "${server_pid}" 2>/dev/null; then
		printf 'timeout\n' > "${timeout_marker}"
		kill -TERM "${server_pid}" 2>/dev/null || true
	fi
) &
watchdog_pid=$!

# A watchdog timeout deliberately terminates the server, which makes wait
# non-zero. Capture that result with errexit briefly suspended so the timeout
# marker can map it to the standard 124 status before the EXIT trap runs.
set +e
wait "${server_pid}"
wait_status=$?
set -e

# A trap-initiated kill terminates the script inside cleanup before
# reaching here, so this exit carries the server's own exit status when
# it stops on its own.
if [ -f "${timeout_marker}" ]; then
	echo "Preview reached WEB_SERVER_MAX_LIFETIME_SECONDS=${WEB_SERVER_MAX_LIFETIME_SECONDS}." >&2
	exit 124
fi
exit "${wait_status}"
