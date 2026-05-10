import type { Credentials, Reservation } from "../types.js";
import { AuthError } from "../../core/errors.js";
import { TockClient } from "./client.js";
import { tockCredentials } from "./auth.js";

interface TockReservation {
  purchaseId?: string;
  id?: string;
  businessName?: string;
  businessSlug?: string;
  date?: string;
  time?: string;
  start?: string;
  size?: number;
  partySize?: number;
  state?: string;
  status?: string;
}

interface TockListResponse {
  reservations?: TockReservation[];
  upcoming?: TockReservation[];
}

/** Pure parser. */
export function parseListResponse(raw: unknown): Reservation[] {
  const r = (raw ?? {}) as TockListResponse;
  const rows = r.reservations ?? r.upcoming ?? [];
  const out: Reservation[] = [];
  for (const x of rows) {
    const id = x.purchaseId ?? x.id;
    if (!id) continue;
    const startTs = x.start ?? `${x.date ?? ""}T${x.time ?? ""}`;
    const dateM = /^(\d{4}-\d{2}-\d{2})/.exec(startTs);
    const timeM = /(\d{2}):(\d{2})/.exec(startTs);
    out.push({
      id,
      venueName: x.businessName ?? "(unknown)",
      venueId: x.businessSlug ?? "",
      date: dateM?.[1] ?? x.date ?? "",
      time: timeM ? `${timeM[1]}:${timeM[2]}` : (x.time ?? ""),
      partySize: x.size ?? x.partySize ?? 0,
      ...(x.state ?? x.status ? { status: x.state ?? x.status! } : {}),
      raw: x,
    });
  }
  return out;
}

export async function listReservations(creds: Credentials): Promise<Reservation[]> {
  const typed = tockCredentials(creds);
  if (!typed.sessionCookies) {
    throw new AuthError(
      "Tock list requires a logged-in session. Run: restaurant auth login tock --from-file <path>",
    );
  }
  const client = new TockClient(typed);
  const raw = await client.listReservations();
  return parseListResponse(raw);
}
