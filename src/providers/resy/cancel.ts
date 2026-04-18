import type { CancelResult, Credentials } from "../types.js";
import { ProviderError } from "../../core/errors.js";
import { ResyClient } from "./client.js";
import { resyCredentials } from "./auth.js";

/**
 * Cancel a reservation by resy_token.
 * see resy-cli: internal/resy/cancel.go
 */
export async function cancel(
  reservationId: string,
  creds: Credentials,
): Promise<CancelResult> {
  const client = new ResyClient(resyCredentials(creds));
  try {
    const raw = (await client.cancel(reservationId)) as {
      cancelled?: boolean;
      cancel_token?: string;
      message?: string;
      error?: { message?: string };
    } | null;

    // Resy's cancel endpoint returns `{cancelled: true}` on success; some
    // versions return a `cancel_token`. Either is a positive signal.
    if (raw?.cancelled || raw?.cancel_token) {
      return { ok: true, raw };
    }
    const msg = raw?.error?.message ?? raw?.message;
    return {
      ok: false,
      ...(msg ? { error: msg } : { error: "Resy cancel returned no confirmation" }),
      raw,
    };
  } catch (e) {
    throw new ProviderError(`Resy cancel failed: ${(e as Error).message}`, "resy");
  }
}
