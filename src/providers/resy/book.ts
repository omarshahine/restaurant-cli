import type { BookRequest, BookResult, Credentials } from "../types.js";
import { ProviderError } from "../../core/errors.js";
import { ResyClient } from "./client.js";
import { resyCredentials } from "./auth.js";
import { getAvailability } from "./availability.js";

/**
 * Shape pulled out of `/3/details`. Resy returns a fair amount of metadata;
 * we only care about the book token and the user's default payment method.
 *
 * see resy-cli: internal/resy/book.go
 */
interface ResyDetailsResponse {
  book_token?: { value?: string };
  user?: { payment_methods?: Array<{ id?: number | string; is_default?: boolean }> };
}

interface ResyBookResponse {
  resy_token?: string;
  reservation_id?: number | string;
  // Some error bodies come back with this shape even on 200:
  message?: string;
  error?: { code?: string; message?: string };
}

type PaymentMethod = { id?: number | string; is_default?: boolean };

/**
 * Pick the payment method to use for the booking. Prefers a default-flagged
 * card; falls back to the first in the list. Throws if none.
 */
function pickPaymentMethodId(methods: PaymentMethod[] | undefined): number | string {
  const list = methods ?? [];
  const def = list.find((m) => m.is_default);
  const chosen = def ?? list[0];
  if (!chosen?.id) {
    throw new ProviderError(
      "No payment method on file for this Resy account. Add one at resy.com before booking.",
      "resy",
    );
  }
  return chosen.id;
}

/**
 * Two-step book:
 *   1. POST /3/details?config_id=...   → book_token + user.payment_methods
 *   2. POST /3/book (book_token + payment method) → resy_token (reservation id)
 *
 * The caller is responsible for having already confirmed with the user.
 * `provider.book` is the destructive call — it will succeed silently if the
 * slot is still open.
 */
export async function book(r: BookRequest, creds: Credentials): Promise<BookResult> {
  const client = new ResyClient(resyCredentials(creds));

  // Resolve a slot token: either one passed in from a prior availability
  // call, or look it up by (venue, date, time) now.
  let configId = r.slotToken;
  if (!configId) {
    const slots = await getAvailability(
      { venueId: r.venueId, date: r.date, partySize: r.partySize },
      creds,
    );
    const match = slots.find((s) => s.time === r.time);
    if (!match) {
      return {
        ok: false,
        error: `No open slot at ${r.time} on ${r.date} for party of ${r.partySize}.`,
      };
    }
    configId = match.token;
  }

  // Step 1: get the short-lived book_token.
  const details = (await client.getBookingDetails({
    configId,
    day: r.date,
    partySize: r.partySize,
  })) as ResyDetailsResponse;

  const bookToken = details.book_token?.value;
  if (!bookToken) {
    throw new ProviderError(
      "Resy /3/details returned no book_token. The slot may have expired — run availability again.",
      "resy",
    );
  }
  const paymentMethodId = pickPaymentMethodId(details.user?.payment_methods);

  // Step 2: commit.
  const result = (await client.confirmBooking({
    bookToken,
    paymentMethodId,
  })) as ResyBookResponse;

  if (!result.resy_token) {
    const msg = result.error?.message ?? result.message ?? "unknown Resy error";
    return {
      ok: false,
      error: `Resy /3/book failed: ${msg}`,
      raw: result,
    };
  }

  return {
    ok: true,
    reservationId: result.resy_token,
    confirmationMessage: `Resy reservation confirmed (resy_token=${result.resy_token})`,
    raw: result,
  };
}
