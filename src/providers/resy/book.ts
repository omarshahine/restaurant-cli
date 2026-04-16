import type { BookRequest, BookResult, Credentials } from "../types.js";
import { CapabilityError } from "../../core/errors.js";

/**
 * Two-step book flow (details → confirm). Deferred to M2.
 * see resy-cli: internal/resy/book.go
 */
export async function book(_r: BookRequest, _creds: Credentials): Promise<BookResult> {
  throw new CapabilityError("resy", "book (deferred to M2)");
}
