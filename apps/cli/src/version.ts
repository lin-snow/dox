export const VERSION = process.env.DOX_CLI_VERSION ?? "dev";
export const COMMIT = process.env.DOX_CLI_COMMIT ?? "unknown";

/**
 * A build without a release tag is not something a person should read in the
 * interface. Keep VERSION for wire/logging code, show this string instead.
 */
export function displayVersion(version: string = VERSION): string {
  const value = version.trim();
  if (
    !value ||
    value === "dev" ||
    value === "local" ||
    value.startsWith("(devel)")
  ) {
    return "";
  }
  return value;
}
