import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  warnPlaintextCredentialStorage,
  warnUnattendedSnipe,
  warnBrowserAutomation,
  resetWarningStateForTests,
} from "../../src/core/warnings.js";

function captureStderr(fn: () => void): string {
  let buf = "";
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
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

  it("warnPlaintextCredentialStorage discloses plaintext storage (once per process)", () => {
    const first = captureStderr(() => warnPlaintextCredentialStorage());
    expect(first).toMatch(/plaintext/i);
    expect(first).toMatch(/Keychain/);
    // Module-level once-guard: a second call in the same process is silent.
    const second = captureStderr(() => warnPlaintextCredentialStorage());
    expect(second).toBe("");
  });

  it("warnUnattendedSnipe warns the job books with no further confirmation", () => {
    const out = captureStderr(() => warnUnattendedSnipe());
    expect(out).toMatch(/WITHOUT asking again/i);
    expect(out).toMatch(/book --yes/);
  });

  it("warnBrowserAutomation fires once per site, mentions ToS, and is mechanism-accurate", () => {
    const ot1 = captureStderr(() => warnBrowserAutomation("OpenTable", "browser-profile"));
    expect(ot1).toMatch(/Terms of Service/);
    expect(ot1).toMatch(/persistent Chrome\n?\s*profile/);
    // Same site again → silent; a different site → warns.
    expect(captureStderr(() => warnBrowserAutomation("OpenTable", "browser-profile"))).toBe("");
    // Tock uses a TLS-impersonating binary — must NOT claim a Chrome profile.
    const tock = captureStderr(() => warnBrowserAutomation("Tock", "tls-binary"));
    expect(tock).toMatch(/Tock/);
    expect(tock).toMatch(/TLS/);
    expect(tock).not.toMatch(/Chrome\s*\n?\s*profile/);
  });
});
