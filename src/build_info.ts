declare const __SUPER_BOWLING_BUILD_VERSION__: string;
declare const __SUPER_BOWLING_BUILD_REVISION__: string;
declare const __SUPER_BOWLING_BUILD_COMMIT_TIME__: string;

export type BuildInfo = {
  version: string;
  revision: string;
  commit_time: string;
};

function generated_value(value: string | undefined, fallback: string): string {
  return value === undefined ? fallback : value;
}

/**
 * Canonical builds replace these values from package.json and the Git commit.
 * The fallbacks keep direct TypeScript execution honest when Git is unavailable.
 */
export const build_info: BuildInfo = {
  version: generated_value(
    typeof __SUPER_BOWLING_BUILD_VERSION__ === "string"
      ? __SUPER_BOWLING_BUILD_VERSION__
      : undefined,
    "local",
  ),
  revision: generated_value(
    typeof __SUPER_BOWLING_BUILD_REVISION__ === "string"
      ? __SUPER_BOWLING_BUILD_REVISION__
      : undefined,
    "local",
  ),
  commit_time: generated_value(
    typeof __SUPER_BOWLING_BUILD_COMMIT_TIME__ === "string"
      ? __SUPER_BOWLING_BUILD_COMMIT_TIME__
      : undefined,
    "unavailable",
  ),
};
