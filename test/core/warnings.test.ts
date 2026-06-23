import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  instructEnvSecret,
  warnUnattendedSnipe,
  warnBrowserAutomation,
  resetWarningStateForTests,
} from "../../src/core/warnings.js";

function captureStderr(fn: () => void): string {
  let buf = "";
  const spy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      buf += String(chunk);
      return true;
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return buf;
}

describe("core/warnings", () => {
  beforeEach(() => resetWarningStateForTests());
  afterEach(() => vi.restoreAllMocks());

  it("instructEnvSecret prints an env-first export line and does not write to disk", () => {
    const out = captureStderr(() =>
      instructEnvSecret("RESY_AUTH_TOKEN", "tok_value_123"),
    );
    // Hands the user a copy-pasteable export line with the value, single-quoted.
    expect(out).toMatch(/export RESY_AUTH_TOKEN='tok_value_123'/);
    // Makes the env-first / not-written-to-disk contract explicit.
    expect(out).toMatch(/does NOT write it to disk/i);
    // Single-quotes in the value are escaped for safe shell paste.
    const esc = captureStderr(() => instructEnvSecret("X", "a'b"));
    expect(esc).toMatch(/export X='a'\\''b'/);
    // Optional note is appended.
    const noted = captureStderr(() =>
      instructEnvSecret("Y", "v", "session cookies are bearer creds"),
    );
    expect(noted).toMatch(/session cookies are bearer creds/);
  });

  it("warnUnattendedSnipe warns the job books with no further confirmation", () => {
    const out = captureStderr(() => warnUnattendedSnipe());
    expect(out).toMatch(/WITHOUT asking again/i);
    expect(out).toMatch(/book --yes/);
  });

  it("warnBrowserAutomation fires once per site, mentions ToS, and is mechanism-accurate", () => {
    const ot1 = captureStderr(() =>
      warnBrowserAutomation("OpenTable", "browser-profile"),
    );
    expect(ot1).toMatch(/Terms of Service/);
    expect(ot1).toMatch(/persistent Chrome\n?\s*profile/);
    // Same site again → silent; a different site → warns.
    expect(
      captureStderr(() =>
        warnBrowserAutomation("OpenTable", "browser-profile"),
      ),
    ).toBe("");
    // Tock uses a TLS-impersonating binary — must NOT claim a Chrome profile.
    const tock = captureStderr(() =>
      warnBrowserAutomation("Tock", "tls-binary"),
    );
    expect(tock).toMatch(/Tock/);
    expect(tock).toMatch(/TLS/);
    expect(tock).not.toMatch(/Chrome\s*\n?\s*profile/);
  });
});
