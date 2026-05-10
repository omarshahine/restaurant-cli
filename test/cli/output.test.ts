import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  compactProject,
  emit,
  parseAgentArgs,
  selectProject,
  toCsv,
} from "../../src/cli/output.js";

describe("parseAgentArgs", () => {
  beforeEach(() => {
    delete process.env["RESTAURANT_CLI_AGENT"];
    delete process.env["RESTAURANT_CLI_DRY_RUN"];
  });

  it("rolls --agent into the constituent flags", () => {
    const a = parseAgentArgs({ agent: true });
    expect(a.json).toBe(true);
    expect(a.compact).toBe(true);
    expect(a.noColor).toBe(true);
    expect(a.noInput).toBe(true);
    expect(a.yes).toBe(true);
    expect(a.agent).toBe(true);
  });

  it("RESTAURANT_CLI_AGENT=1 acts as a floor", () => {
    process.env["RESTAURANT_CLI_AGENT"] = "1";
    const a = parseAgentArgs({});
    expect(a.agent).toBe(true);
    expect(a.json).toBe(true);
    expect(a.yes).toBe(true);
  });

  it("RESTAURANT_CLI_DRY_RUN=1 forces dry-run", () => {
    process.env["RESTAURANT_CLI_DRY_RUN"] = "1";
    const a = parseAgentArgs({});
    expect(a.dryRun).toBe(true);
  });

  it("rejects --json + --csv together", () => {
    expect(() => parseAgentArgs({ json: true, csv: true })).toThrow(/mutually exclusive/);
  });

  it("passes --select through verbatim", () => {
    const a = parseAgentArgs({ select: "id,name" });
    expect(a.select).toBe("id,name");
  });
});

describe("compactProject", () => {
  it("passes single objects through (envelope shape)", () => {
    const input = { id: "abc", name: "Le B", neighborhood: "Midtown", price: 4 };
    expect(compactProject(input)).toEqual(input);
  });
  it("recurses into arrays and drops non-allowlisted row fields", () => {
    const input = [
      { id: "1", name: "a", extra: 1 },
      { id: "2", name: "b", extra: 2 },
    ];
    expect(compactProject(input)).toEqual([
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ]);
  });
  it("passes through scalars", () => {
    expect(compactProject(42)).toBe(42);
    expect(compactProject("hi")).toBe("hi");
  });
});

describe("selectProject", () => {
  it("projects flat fields", () => {
    const input = { id: "1", name: "a", price: 4 };
    expect(selectProject(input, ["id", "name"])).toEqual({ id: "1", name: "a" });
  });
  it("supports dotted paths", () => {
    const input = { venue: { id: "x", name: "Y" }, time: "19:00" };
    expect(selectProject(input, ["venue.id", "time"])).toEqual({
      "venue.id": "x",
      time: "19:00",
    });
  });
  it("returns undefined for missing paths (gets dropped by JSON.stringify)", () => {
    const out = selectProject({ a: 1 }, ["a", "b"]) as Record<string, unknown>;
    expect(out["a"]).toBe(1);
    expect(out["b"]).toBeUndefined();
  });
  it("returns array of projections when input is an array", () => {
    const input = [{ id: "1", name: "a" }, { id: "2", name: "b" }];
    expect(selectProject(input, ["id"])).toEqual([{ id: "1" }, { id: "2" }]);
  });
});

describe("toCsv", () => {
  it("emits header + rows from a flat object array", () => {
    const csv = toCsv([{ id: "1", name: "a" }, { id: "2", name: "b,c" }]);
    expect(csv).toBe(`id,name\n1,a\n2,"b,c"`);
  });
  it("handles nested paths via dotted headers from the first row", () => {
    const csv = toCsv([{ venue: { id: "1" } }]);
    expect(csv).toBe(`venue.id\n1`);
  });
  it("wraps a single object as one row", () => {
    const csv = toCsv({ id: "1", name: "a" });
    expect(csv).toBe(`id,name\n1,a`);
  });
});

describe("emit", () => {
  let stdout: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeMock: any;
  beforeEach(() => {
    stdout = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeMock = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    }) as any);
  });
  afterEach(() => {
    writeMock.mockRestore();
  });

  it("emits JSON when args.json", () => {
    emit({ a: 1 }, { json: true });
    expect(JSON.parse(stdout)).toEqual({ a: 1 });
  });

  it("applies --compact to rows in an array", () => {
    emit([{ id: "1", name: "a", extra: "drop" }], { json: true, compact: true });
    expect(JSON.parse(stdout)).toEqual([{ id: "1", name: "a" }]);
  });

  it("applies --select on a single envelope object", () => {
    emit(
      { id: "1", name: "a", extra: "drop" },
      { json: true, compact: true, select: "name" },
    );
    expect(JSON.parse(stdout)).toEqual({ name: "a" });
  });

  it("falls through to human renderer", () => {
    emit({ id: "1" }, {}, { human: (v) => `id=${v.id}` });
    expect(stdout).toBe("id=1\n");
  });

  it("prints empty hint when array is empty in human mode", () => {
    emit([], {}, { empty: "Nothing here." });
    expect(stdout).toBe("Nothing here.\n");
  });
});
