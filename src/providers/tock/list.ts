import type { Credentials, Reservation } from "../types.js";
import { AuthError } from "../../core/errors.js";
import { tockCredentials } from "./auth.js";

/**
 * Tock list — requires session cookies + verified GraphQL op name. Cookie
 * import is wired (see `auth login tock --from-file`); the SSR-state path
 * for `/profile/upcoming` parses `state.patron.purchaseSummaries[]` but
 * hasn't been live-verified in this PR.
 *
 * Capability flag is false in `provider.ts` so the CapabilityError fires
 * before this function is called. Kept as a typed stub so the `Provider`
 * interface contract holds.
 */
export async function listReservations(creds: Credentials): Promise<Reservation[]> {
  const typed = tockCredentials(creds);
  if (!typed.sessionCookies) {
    throw new AuthError(
      "Tock list requires a logged-in session. Run: restaurant auth login tock --from-file <path>",
    );
  }
  throw new AuthError(
    "tock_list_unverified: SSR /profile/upcoming parse path scaffolded but not wired. " +
      "See provider.ts for the capability flag and CHANGELOG follow-ups.",
  );
}
