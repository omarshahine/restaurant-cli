/**
 * Parse an ISO8601 timestamp with an explicit offset (e.g. the
 * `--release-at` flag for `restaurant snipe`). Rejects timestamps that lack a
 * timezone offset — otherwise "2026-04-30T10:00" is ambiguous and causes
 * scheduler drift between machines in different timezones.
 */
export function parseReleaseAt(input: string): Date {
  if (!/[+-]\d{2}:?\d{2}$|Z$/.test(input)) {
    throw new Error(
      `--release-at must include a timezone offset (e.g. "2026-04-30T10:00-04:00"). Got: ${input}`,
    );
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Unparseable timestamp: ${input}`);
  }
  return d;
}

/** Validate YYYY-MM-DD. */
export function assertDate(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`Expected date in YYYY-MM-DD form, got: ${s}`);
  }
  return s;
}

/** Validate HH:mm (24h). */
export function assertTime(s: string): string {
  if (!/^\d{2}:\d{2}$/.test(s)) {
    throw new Error(`Expected time in HH:mm form (24h), got: ${s}`);
  }
  return s;
}
