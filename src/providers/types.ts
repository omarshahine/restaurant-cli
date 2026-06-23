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
  /**
   * Provider can generate a user-facing booking deep link but cannot complete
   * the booking via API (e.g. OpenTable — user must click Confirm themselves).
   * This is a safety-first capability: the CLI/agents should prefer `bookUrl`
   * over `book` whenever both are false unless the user explicitly opts in
   * to browser-automation booking.
   */
  bookUrl?: boolean;
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
  /**
   * If true, the answer is fed to `auth.login()` and discarded — never
   * persisted. Used for passwords that get exchanged for durable tokens.
   */
  ephemeral?: boolean;
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
  /**
   * Hard confirmation gate. A provider that mutates a real account (Resy)
   * MUST refuse to book unless this is explicitly `true`. Callers set it only
   * after their own user-confirmation step (the CLI's y/N prompt or `--yes`,
   * the OpenClaw tool's documented "confirm before invoking" contract). This
   * is defense in depth: a miswired or injected call that forgets to set it
   * fails closed instead of silently booking.
   */
  confirmed?: boolean;
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
    /**
     * Optional. If present, `restaurant setup` runs it after collecting the
     * setup prompts and uses the returned Credentials as the final creds to
     * persist. Use this to exchange an email+password for a durable auth
     * token so users never have to copy secrets out of DevTools.
     */
    login?(input: Credentials): Promise<Credentials>;
  };

  searchVenues(q: VenueQuery, creds: Credentials): Promise<Venue[]>;
  getAvailability(q: AvailabilityQuery, creds: Credentials): Promise<Slot[]>;
  book(r: BookRequest, creds: Credentials): Promise<BookResult>;
  /**
   * Cancel a reservation. `opts.confirmed` is the hard gate for providers that
   * mutate a real account (Resy): they MUST refuse unless it is explicitly
   * `true`. Callers set it only after their own confirmation step.
   */
  cancel(
    reservationId: string,
    creds: Credentials,
    opts?: { confirmed?: boolean },
  ): Promise<CancelResult>;
  listReservations(creds: Credentials): Promise<Reservation[]>;
  /**
   * Optional. Implemented when `capabilities.bookUrl` is true. Returns a
   * user-facing URL the user can open to complete the booking themselves.
   * The CLI treats this as a hand-off, not a completed booking.
   */
  getBookingUrl?(r: BookRequest, creds: Credentials): Promise<string>;
}
