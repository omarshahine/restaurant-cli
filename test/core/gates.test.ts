import { describe, it, expect, afterEach } from "vitest";
import {
  requireOptIn,
  requireSnipeEnabled,
  requireSiteAutomationEnabled,
  isOptInEnabled,
  SNIPE_ENV,
  SITE_AUTOMATION_ENV,
} from "../../src/core/gates.js";

describe("core/gates", () => {
  const touched: string[] = [];
  function setEnv(k: string, v: string | undefined): void {
    touched.push(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  afterEach(() => {
    for (const k of touched) delete process.env[k];
    touched.length = 0;
  });

  it("isOptInEnabled is true only for exactly '1'", () => {
    setEnv("RESTAURANT_CLI_TEST_GATE", undefined);
    expect(isOptInEnabled("RESTAURANT_CLI_TEST_GATE")).toBe(false);
    setEnv("RESTAURANT_CLI_TEST_GATE", "true");
    expect(isOptInEnabled("RESTAURANT_CLI_TEST_GATE")).toBe(false);
    setEnv("RESTAURANT_CLI_TEST_GATE", "1");
    expect(isOptInEnabled("RESTAURANT_CLI_TEST_GATE")).toBe(true);
  });

  it("requireOptIn throws an actionable error when disabled, names the env var", () => {
    setEnv("RESTAURANT_CLI_TEST_GATE", undefined);
    expect(() =>
      requireOptIn("RESTAURANT_CLI_TEST_GATE", "Thing", "It is risky."),
    ).toThrow(
      /Thing is off by default.*It is risky.*RESTAURANT_CLI_TEST_GATE=1/s,
    );
  });

  it("requireOptIn is a no-op when enabled", () => {
    setEnv("RESTAURANT_CLI_TEST_GATE", "1");
    expect(() =>
      requireOptIn("RESTAURANT_CLI_TEST_GATE", "Thing", "why"),
    ).not.toThrow();
  });

  it("requireSnipeEnabled gates on the snipe env var", () => {
    setEnv(SNIPE_ENV, undefined);
    expect(() => requireSnipeEnabled()).toThrow(
      /Scheduled sniping is off by default/,
    );
    setEnv(SNIPE_ENV, "1");
    expect(() => requireSnipeEnabled()).not.toThrow();
  });

  it("requireSiteAutomationEnabled gates on the automation env var and names the op", () => {
    setEnv(SITE_AUTOMATION_ENV, undefined);
    expect(() => requireSiteAutomationEnabled("OpenTable search")).toThrow(
      /OpenTable search is off by default.*Terms of Service/s,
    );
    setEnv(SITE_AUTOMATION_ENV, "1");
    expect(() =>
      requireSiteAutomationEnabled("OpenTable search"),
    ).not.toThrow();
  });
});
