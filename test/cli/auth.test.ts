import { describe, it, expect } from "vitest";
import { normalizeCookieBlob } from "../../src/cli/commands/auth.js";

describe("normalizeCookieBlob", () => {
  it("passes through a plain cookie string", () => {
    const s = "a=1; b=2; c=3";
    expect(normalizeCookieBlob(s)).toBe(s);
  });

  it("strips newlines from a plain string", () => {
    expect(normalizeCookieBlob("a=1\nb=2")).toBe("a=1 b=2");
  });

  it("converts a JSON array of {name, value} into a cookie header", () => {
    const json = JSON.stringify([
      { name: "session", value: "abc" },
      { name: "auth", value: "def" },
    ]);
    expect(normalizeCookieBlob(json)).toBe("session=abc; auth=def");
  });

  it("unwraps a {cookies: [...]} envelope", () => {
    const json = JSON.stringify({
      cookies: [{ name: "x", value: "1" }, { name: "y", value: "2" }],
    });
    expect(normalizeCookieBlob(json)).toBe("x=1; y=2");
  });

  it("filters by providerHost when supplied", () => {
    const json = JSON.stringify([
      { name: "session", value: "abc", domain: "exploretock.com" },
      { name: "ga", value: "def", domain: "google-analytics.com" },
    ]);
    expect(normalizeCookieBlob(json, "exploretock.com")).toBe("session=abc");
  });

  it("throws on garbage JSON shape", () => {
    expect(() => normalizeCookieBlob('{"foo": "bar"}')).toThrow(/array of/);
  });

  it("throws on broken JSON", () => {
    expect(() => normalizeCookieBlob("[not json")).toThrow();
  });
});
