import type { CancelResult, Credentials } from "../types.js";
import { AuthError } from "../../core/errors.js";
import { tockCredentials } from "./auth.js";

/**
 * Tock cancel — form-submit POST `/<slug>/receipt/cancel` (NOT XHR). The
 * exact form body shape wasn't captured by trg either (chrome-MCP privacy
 * filter blocked it during their research). Default-off behind capability
 * flag; this stub errors honestly so callers (especially agents) see why.
 */
export async function cancel(
  _reservationId: string,
  creds: Credentials,
): Promise<CancelResult> {
  const typed = tockCredentials(creds);
  if (!typed.sessionCookies) {
    return {
      ok: false,
      error:
        "tock_cancel_unauthorized: Tock cancel requires a logged-in session. " +
        "Run: restaurant auth login tock --from-file <path>",
    };
  }
  return {
    ok: false,
    error:
      "tock_cancel_unverified: form-submit body shape not yet captured. " +
      "Path is POST /<slug>/receipt/cancel with form-encoded body; needs chromedp pattern.",
  };
}
