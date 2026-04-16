/**
 * The pluggable provider seam.
 *
 * Every reservation platform (Resy, OpenTable, Tock, SevenRooms, ...) is a
 * separate module under `src/providers/<id>/` that exports a `Provider`
 * implementation. Core code dispatches through the registry (`registry.ts`)
 * and never imports provider modules directly, so adding a new platform is a
 * two-file change: create `src/providers/<id>/` + add one line to
 * `bootstrap.ts`.
 */

export type ProviderId = string;

/**
 * Declares which features a provider supports so the CLI and agents can
 * gracefully degrade rather than throw on unsupported commands.
 */
export interface ProviderCapabilities {
  search: boolean;
  availability: boolean;
  book: boolean;
  cancel: boolean;
  list: boolean;
  /** Supports timed-release ("sniping") future bookings. */
  snipe: boolean;
  /** Future capability: waitlist management. */
  waitlist?: boolean;
  /** Future capability: notify when a slot opens. */
  notifyOnOpen?: boolean;
}

/** Opaque auth material specific to a provider. Stored per-provider in config. */
export type Credentials = Record<string, string>;

export interface AuthStatus {
  ok: boolean;
  /** e.g. resolved email, user id, display name. Free-form for UI/doctor output. */
  detail?: string;
  /** Populated when `ok` is false. */
  error?: string;
}

/**
 * Describes one question the `setup` command should ask the user when
 * configuring this provider. The answer is persisted to either the config
 * file or the secrets file depending on `sensitive`.
 */
export interface SetupPrompt {
  id: string;
  label: string;
  help?: string;
  sensitive: boolean;
  /** If present, stored as an env var name in ~/.secrets.env (sensitive only). */
  envVar?: string;
}

export interface Venue {
  id: string;
  name: string;
  city?: string;
  region?: string;
  cuisine?: string;
  url?: string;
  raw?: unknown;
}

export interface VenueQuery {
  query: string;
  city?: string;
  limit?: number;
}

export interface Slot {
  token: string;
  time: string; // "HH:mm"
  configId?: string;
  type?: string; // e.g. "Dining Room", "Bar"
  raw?: unknown;
}

export interface AvailabilityQuery {
  venueId: string;
  date: string; // YYYY-MM-DD
  partySize: number;
}

export interface BookRequest {
  venueId: string;
  partySize: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  /**
   * Opaque provider-specific token for two-step flows (Resy returns one from
   * availability search that must be fed back to book). Other providers may
   * ignore this.
   */
  slotToken?: string;
  notes?: string;
}

export interface BookResult {
  ok: boolean;
  reservationId?: string;
  confirmationMessage?: string;
  error?: string;
  raw?: unknown;
}

export interface CancelResult {
  ok: boolean;
  error?: string;
  raw?: unknown;
}

export interface Reservation {
  id: string;
  venueName: string;
  venueId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  partySize: number;
  status?: string;
  raw?: unknown;
}

/**
 * The interface every reservation-platform module implements.
 *
 * `id` is a plain string (not a union type) so adding a provider never forces
 * a change to this file. Declare capabilities honestly — the CLI reads them
 * to decide which subcommands to expose for the provider.
 */
export interface Provider {
  id: ProviderId;
  displayName: string;
  capabilities: ProviderCapabilities;

  auth: {
    validate(creds: Credentials): Promise<AuthStatus>;
    setupPrompts(): SetupPrompt[];
  };

  searchVenues(q: VenueQuery, creds: Credentials): Promise<Venue[]>;
  getAvailability(q: AvailabilityQuery, creds: Credentials): Promise<Slot[]>;
  book(r: BookRequest, creds: Credentials): Promise<BookResult>;
  cancel(reservationId: string, creds: Credentials): Promise<CancelResult>;
  listReservations(creds: Credentials): Promise<Reservation[]>;
}
