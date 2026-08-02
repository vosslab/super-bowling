#!/usr/bin/env bash
# capture_screenshots.sh - reproducible README captures and milestone probes.
#
# Front door for documentation refreshes and temporary rollout evidence. It
# builds the shipped dist/ artifact, owns a short-lived local server, and
# invokes the maintained Playwright interaction helper.
#
# Usage:
#   ./capture_screenshots.sh
#   ./capture_screenshots.sh --milestone
#   ./capture_screenshots.sh --camera-bakeoff
#   ./capture_screenshots.sh --all

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

mode="documentation"
port="4199"
server_pid=""
capture_pid=""
capture_timeout_seconds="90"

usage() {
	cat <<'USAGE'
Usage: capture_screenshots.sh [--documentation|--milestone|--camera-bakeoff|--all] [--port PORT]
                             [--capture-timeout SECONDS]

  --documentation  Refresh the managed README PNGs (default).
  --milestone      Write temporary 10, 105, and 990 evidence under artifacts/.
  --camera-bakeoff Write temporary camera-comparison evidence under artifacts/.
  --all            Run both documentation and milestone capture modes.
  --port PORT      Local server port (default: 4199).
  --capture-timeout SECONDS  Browser capture deadline (default: 90 seconds).
  -h, --help       Print this help and exit.
USAGE
}

cleanup() {
	local status=$?
	trap - EXIT INT TERM HUP
	if [ -n "${capture_pid}" ] && kill -0 "${capture_pid}" 2>/dev/null; then
		echo "==> Stopping capture browser" >&2
		kill "${capture_pid}" 2>/dev/null || true
		wait "${capture_pid}" 2>/dev/null || true
	fi
	if [ -n "${server_pid}" ] && kill -0 "${server_pid}" 2>/dev/null; then
		echo "==> Stopping capture server" >&2
		kill "${server_pid}" 2>/dev/null || true
		wait "${server_pid}" 2>/dev/null || true
	fi
	exit "${status}"
}
trap cleanup EXIT
trap 'exit 128' INT TERM HUP

while [ "$#" -gt 0 ]; do
	case "$1" in
		--documentation)
			mode="documentation"
			;;
		--milestone)
			mode="milestone"
			;;
		--camera-bakeoff)
			mode="camera-bakeoff"
			;;
		--all)
			mode="all"
			;;
		--port)
			shift
			if [ "$#" -eq 0 ]; then
				echo "ERROR: --port requires a value." >&2
				exit 2
			fi
			port="$1"
			;;
		--capture-timeout)
			shift
			if [ "$#" -eq 0 ]; then
				echo "ERROR: --capture-timeout requires a value." >&2
				exit 2
			fi
			capture_timeout_seconds="$1"
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			echo "ERROR: unknown option: $1" >&2
			usage >&2
			exit 2
			;;
	esac
	shift
done

if ! [[ "${port}" =~ ^[1-9][0-9]*$ ]] || [ "${port}" -gt 65535 ]; then
	echo "ERROR: port must be an integer from 1 to 65535." >&2
	exit 2
fi

if ! [[ "${capture_timeout_seconds}" =~ ^[1-9][0-9]*$ ]]; then
	echo "ERROR: capture timeout must be a positive whole number of seconds." >&2
	exit 2
fi

if [ ! -d node_modules ]; then
	echo "ERROR: node_modules/ missing. Run ./devel/setup_typescript.sh first." >&2
	exit 1
fi

echo "==> Building shipped browser artifact"
./build_github_pages.sh

echo "==> Serving dist/ at http://127.0.0.1:${port}/"
mkdir -p tmp docs/screenshots
source source_me.sh
python3 -m http.server "${port}" --directory dist >"tmp/capture_screenshots_server.log" 2>&1 &
server_pid=$!

attempt=0
while [ "${attempt}" -lt 50 ]; do
	if curl -fsS "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
		break
	fi
	if ! kill -0 "${server_pid}" 2>/dev/null; then
		echo "FAIL: capture server exited before becoming ready on port ${port}." >&2
		tail -n 20 tmp/capture_screenshots_server.log >&2 || true
		exit 1
	fi
	attempt=$((attempt + 1))
	sleep 0.1
done

if ! curl -fsS "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
	echo "FAIL: capture server did not become ready on port ${port}." >&2
	exit 1
fi

echo "==> Capturing ${mode} views"
node --import tsx devel/capture_screenshots.mjs \
	--base-url "http://127.0.0.1:${port}/" \
	--mode "${mode}" \
	--timeout-seconds "${capture_timeout_seconds}" >"tmp/capture_screenshots_browser.log" 2>&1 &
capture_pid=$!

set +e
wait "${capture_pid}"
capture_status=$?
set -e

if [ "${capture_status}" -ne 0 ]; then
	echo "FAIL: browser capture exited with status ${capture_status}." >&2
	tail -n 40 tmp/capture_screenshots_browser.log >&2 || true
	exit "${capture_status}"
fi
cat tmp/capture_screenshots_browser.log
echo "PASS: ${mode} screenshot capture completed."
