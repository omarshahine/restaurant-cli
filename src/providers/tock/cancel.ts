import type { CancelResult, Credentials } from "../types.js";
import { AuthError } from "../../core/errors.js";
import { TockClient } from "./client.js";
import { tockCredentials } from "./auth.js";

export async function cancel(
  reservationId: string,
  creds: Credentials,
): Promise<CancelResult> {
  const typed = tockCredentials(creds);
  if (!typed.sessionCookies) {
    throw new AuthError(
      "Tock cancel requires a logged-in session. Run: restaurant auth login tock --from-file <path>",
    );
  }
  const client = new TockClient(typed);
  try {
    const raw = await client.cancelReservation(reservationId);
    return { ok: true, raw };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
