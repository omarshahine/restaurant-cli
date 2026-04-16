import type { AvailabilityQuery, Credentials, Slot } from "../types.js";
import { CapabilityError } from "../../core/errors.js";

/**
 * Availability parsing is deferred to M2. The HTTP method exists in
 * `client.ts` but the result-shape mapping is intentionally omitted until we
 * implement booking end-to-end.
 *
 * see resy-cli: internal/resy/find.go
 */
export async function getAvailability(
  _q: AvailabilityQuery,
  _creds: Credentials,
): Promise<Slot[]> {
  throw new CapabilityError("resy", "availability (deferred to M2)");
}
