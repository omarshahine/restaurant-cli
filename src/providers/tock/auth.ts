/**
 * Tock auth — Tock has no email/password API exchange the way Resy does;
 * authenticated calls hinge on the session cookies imported via
 * `restaurant auth login tock --from-file <chrome-cookies.json>`.
 *
 * Reads cookies from:
 *   1. `TOCK_SESSION_COOKIES` env var (canonical, written by auth login)
 *   2. `creds.sessionCookies` (when passed through programmatically)
 */

import type { AuthStatus, Credentials, SetupPrompt } from "../types.js";
import type { TockCredentials } from "./schemas.js";

export function tockCredentials(creds: Credentials): TockCredentials {
  const out: TockCredentials = {};
  const cookies = creds["sessionCookies"] ?? process.env["TOCK_SESSION_COOKIES"];
  if (cookies) out.sessionCookies = cookies;
  if (creds["authToken"]) out.authToken = creds["authToken"];
  if (creds["email"]) out.email = creds["email"];
  return out;
}

export async function validateTock(creds: Credentials): Promise<AuthStatus> {
  const typed = tockCredentials(creds);
  if (typed.sessionCookies) {
    return { ok: true, detail: "session cookies loaded" };
  }
  return {
    ok: true,
    detail:
      "anonymous (read-only). Run `restaurant auth login tock --from-file <export>` for authenticated calls.",
  };
}

export function tockSetupPrompts(): SetupPrompt[] {
  // Empty: setup is handled out-of-band via `restaurant auth login tock`.
  return [];
}
