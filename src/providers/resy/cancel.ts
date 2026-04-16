import type { CancelResult, Credentials, Reservation } from "../types.js";
import { CapabilityError } from "../../core/errors.js";

/** see resy-cli: internal/resy/cancel.go */
export async function cancel(_id: string, _creds: Credentials): Promise<CancelResult> {
  throw new CapabilityError("resy", "cancel (deferred to M2)");
}

/** see resy-cli: internal/resy/reservations.go */
export async function listReservations(_creds: Credentials): Promise<Reservation[]> {
  throw new CapabilityError("resy", "list (deferred to M2)");
}
