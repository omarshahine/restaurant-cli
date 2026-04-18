import { describe, it, expect } from "vitest";
import { shellQuote } from "../../src/core/shell.js";

describe("core/shell", () => {
  describe("shellQuote", () => {
    it("wraps a plain string in single quotes", () => {
      expect(shellQuote("hello")).toBe("'hello'");
    });

    it("escapes inner single quotes with the '\\'' dance", () => {
      expect(shellQuote("it's fine")).toBe(`'it'\\''s fine'`);
    });

    it("leaves double quotes, backticks, and dollar signs alone inside the single-quote wrapper", () => {
      // Inside single quotes, bash doesn't interpret these specials, so we
      // don't need to escape them. Keeping them verbatim is the entire point
      // of single-quote wrapping.
      expect(shellQuote(`"$bar" \`baz\``)).toBe(`'"$bar" \`baz\`'`);
    });

    it("handles empty strings without collapsing the quotes", () => {
      expect(shellQuote("")).toBe("''");
    });
  });
});
