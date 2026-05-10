import type { AvailabilityQuery, Credentials, Slot } from "../types.js";
import { TockClient } from "./client.js";
import { tockCredentials } from "./auth.js";

interface TockAvailabilitySlot {
  experienceId?: string | number;
  experienceName?: string;
  time?: string; // ISO local "YYYY-MM-DDTHH:mm" or HH:mm in some shapes
  start?: string;
  size?: number;
  /** Tock's opaque slot token, threaded into book. */
  token?: string;
  attributes?: string[];
}

interface TockAvailabilityResponse {
  slots?: TockAvailabilitySlot[];
  experiences?: { id?: string | number; name?: string; slots?: TockAvailabilitySlot[] }[];
}

/**
 * Pull `HH:mm` out of a Tock time string. Tock sometimes uses ISO local time
 * like `2026-05-15T19:00`; other shapes are bare `19:00`.
 */
export function parseTockTime(s: string): string {
  const m = /(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}:${m[2]}` : s;
}

/**
 * Pure parser. Returns Slot[] preserving Tock's opaque token and attributes.
 * Test fixtures use this directly.
 */
export function parseAvailabilityResponse(raw: unknown): Slot[] {
  const r = (raw ?? {}) as TockAvailabilityResponse;
  const slots: Slot[] = [];
  const eat = (s: TockAvailabilitySlot, expName?: string): void => {
    const t = s.start ?? s.time;
    if (!t) return;
    const token = s.token ?? String(s.experienceId ?? "");
    if (!token) return;
    slots.push({
      token,
      time: parseTockTime(t),
      ...(s.experienceId !== undefined ? { configId: String(s.experienceId) } : {}),
      ...(expName ?? s.experienceName ? { type: (expName ?? s.experienceName)! } : {}),
      raw: s,
    });
  };
  for (const s of r.slots ?? []) eat(s);
  for (const exp of r.experiences ?? []) {
    for (const s of exp.slots ?? []) eat(s, exp.name);
  }
  return slots;
}

export async function getAvailability(
  q: AvailabilityQuery,
  creds: Credentials,
): Promise<Slot[]> {
  const client = new TockClient(tockCredentials(creds));
  const raw = await client.getAvailability({
    venueId: q.venueId,
    date: q.date,
    partySize: q.partySize,
  });
  return parseAvailabilityResponse(raw);
}
