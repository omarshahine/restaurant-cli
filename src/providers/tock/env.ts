/**
 * Tock-side env-var helpers, kept out of the network layer so wire-protocol
 * modules stay focused.
 */

export type TockMode = "api" | "browser" | "auto";

export function getTockMode(): TockMode {
  const m = process.env["RESTAURANT_CLI_TOCK_MODE"];
  if (m === "api" || m === "browser" || m === "auto") return m;
  return "auto";
}

export function isTockBookAllowed(): boolean {
  return process.env["RESTAURANT_CLI_TOCK_ALLOW_BOOK"] === "1";
}

export function isDebugEnabled(): boolean {
  return Boolean(process.env["RESTAURANT_CLI_DEBUG"]);
}
