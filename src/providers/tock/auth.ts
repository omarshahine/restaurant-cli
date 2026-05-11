/**
 * Tock auth. There are TWO independent surfaces:
 *
 *   1. `restaurants list`/`availability check` — anonymous reads via the
 *      `table-reservation-goat-pp-cli` Go binary (no user auth needed).
 *      Doctor validates by checking the binary is on disk.
 *
 *   2. `list`/`cancel`/`book` — require imported session cookies. Wired
 *      via `restaurant auth login tock --from-file`. Not implemented yet;
 *      capability flags in `provider.ts` are false.
 */

import type { AuthStatus, Credentials, SetupPrompt } from "../types.js";
import type { TockCredentials } from "./schemas.js";
import { resolveTrgBinary } from "./trg.js";

export function tockCredentials(creds: Credentials): TockCredentials {
  const out: TockCredentials = {};
  const cookies = creds["sessionCookies"] ?? process.env["TOCK_SESSION_COOKIES"];
  if (cookies) out.sessionCookies = cookies;
  if (creds["authToken"]) out.authToken = creds["authToken"];
  if (creds["email"]) out.email = creds["email"];
  return out;
}

export async function validateTock(creds: Credentials): Promise<AuthStatus> {
  const bin = resolveTrgBinary();
  const typed = tockCredentials(creds);
  const parts: string[] = [];
  if (bin) {
    parts.push(`trg binary: ${bin}`);
  } else {
    return {
      ok: false,
      error:
        "trg binary not found. Install with: npx -y @mvanhorn/printing-press install table-reservation-goat",
    };
  }
  if (typed.sessionCookies) {
    parts.push("session cookies loaded (for future list/cancel)");
  } else {
    parts.push("anonymous (search + availability only)");
  }
  return { ok: true, detail: parts.join("; ") };
}

export function tockSetupPrompts(): SetupPrompt[] {
  // Cookies are imported via `restaurant auth login tock --from-file`, not
  // through `setup`. Returning [] makes the provider behave as anonymous-ok
  // in the credentials/doctor flows.
  return [];
}
