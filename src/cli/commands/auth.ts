/**
 * `restaurant auth login --chrome <provider>` — import session cookies from
 * the local Chrome profile. env-first: the cookies are NOT written to disk;
 * the command prints an `export <PROVIDER>_SESSION_COOKIES=…` line for the
 * user to add to their own environment, and the value is read from there.
 *
 * Why Chrome? Tock's checkout flow uses Auth0 + Braintree CSRF bound to a
 * real browser session; partner API keys don't exist. The path of least
 * resistance is to reuse the user's already-logged-in Chrome session.
 *
 * Cookie value encoding: stored as a single URL-encoded string of `name=value`
 * pairs separated by `; `, ready to drop into a `Cookie:` HTTP header.
 *
 * Limitations:
 *   - Reading Chrome's encrypted cookie DB requires the OS keychain on macOS
 *     (Chrome Safe Storage), which this tool intentionally avoids (it never
 *     uses the macOS Keychain). Instead we use a `--from-file` path where the
 *     user exports their own cookies via Chrome DevTools → Application →
 *     Cookies → "copy as JSON" and pipes that file in. Documented in the
 *     README. These are the user's own session cookies for their own account.
 *   - For Tock and OpenTable only — Resy uses email/password → token
 *     exchange and doesn't need this path.
 */

import { defineCommand } from "citty";
import { readFileSync } from "node:fs";
import { AGENT_ARGS, emit, emitError, parseAgentArgs } from "../output.js";
import { UsageError } from "../../core/errors.js";
import { instructEnvSecret } from "../../core/warnings.js";

const KNOWN_PROVIDERS = new Set(["opentable", "tock"]);

/**
 * Accept the DevTools "Copy as cURL" cookies blob or the "Copy" cookie-table
 * JSON. Returns a normalized `name=value; ...` cookie string suitable for
 * the HTTP Cookie header.
 *
 * Supported shapes:
 *   1. Plain string: `name1=value1; name2=value2; ...` — passed through.
 *   2. JSON array: `[{name, value}, ...]` — common DevTools paste shape.
 *   3. JSON object: `{cookies: [{name, value}, ...]}` — Playwright's export shape.
 */
export function normalizeCookieBlob(
  input: string,
  providerHost?: string,
): string {
  const trimmed = input.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) {
    return trimmed.replace(/\n/g, " ");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new UsageError(
      `Cookie input looks like JSON but failed to parse. Expected a cookie string or DevTools JSON.`,
    );
  }
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { cookies?: unknown[] }).cookies)
      ? (parsed as { cookies: unknown[] }).cookies
      : null;
  if (!arr) {
    throw new UsageError(
      "Cookie JSON must be an array of {name, value} or {cookies: [...]}.",
    );
  }
  const pairs: string[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { name?: string; value?: string; domain?: string };
    if (!e.name || e.value === undefined) continue;
    if (providerHost && e.domain && !e.domain.includes(providerHost)) continue;
    pairs.push(`${e.name}=${e.value}`);
  }
  return pairs.join("; ");
}

function envVarFor(providerId: string): string {
  return `${providerId.toUpperCase()}_SESSION_COOKIES`;
}

const loginCmd = defineCommand({
  meta: {
    name: "login",
    description:
      "Import session cookies and print an export line to add to your env (see --from-file)",
  },
  args: {
    provider: {
      type: "positional",
      description: "Provider id (opentable | tock)",
      required: true,
    },
    chrome: {
      type: "boolean",
      description:
        "(reserved) Direct Chrome cookie-DB import. Currently unsupported on macOS without keychain; use --from-file.",
      default: false,
    },
    "from-file": {
      type: "string",
      description:
        "Path to a file containing the cookie blob (DevTools JSON or `name=value; ...` string)",
      default: "",
    },
    ...AGENT_ARGS,
  },
  run({ args }) {
    const agentArgs = parseAgentArgs(
      args as unknown as Record<string, unknown>,
    );
    const providerId = String(args.provider).toLowerCase();
    if (!KNOWN_PROVIDERS.has(providerId)) {
      throw new UsageError(
        `auth login is only supported for: ${[...KNOWN_PROVIDERS].join(", ")}. ` +
          `For Resy, use \`restaurant setup resy\`.`,
      );
    }

    const file = String(args["from-file"] ?? "");
    if (args.chrome && !file) {
      emitError(
        `Direct Chrome cookie-DB read is not supported on macOS without the keychain. ` +
          `Open Chrome DevTools → Application → Cookies → ${providerId === "tock" ? "exploretock.com" : "opentable.com"}, ` +
          `copy as JSON, save to a file, and run with --from-file <path>.`,
        agentArgs,
        { code: "usage", exitCode: 2 },
      );
      return;
    }
    if (!file) {
      throw new UsageError(
        `Pass --from-file <path> with a Chrome-exported cookie blob.`,
      );
    }

    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch (e) {
      throw new UsageError(
        `Could not read cookie file: ${(e as Error).message}`,
      );
    }

    const host = providerId === "tock" ? "exploretock.com" : "opentable.com";
    const cookieHeader = normalizeCookieBlob(raw, host);
    if (!cookieHeader) {
      throw new UsageError(
        `No usable cookies found for ${host} in ${file}. ` +
          `Make sure the export contains rows for that domain.`,
      );
    }

    const envVar = envVarFor(providerId);
    if (process.env[envVar]) {
      const result = {
        ok: true,
        envVar,
        status: "already_loaded",
        message: `${envVar} is already set in your environment. Unset it first to rotate.`,
      };
      emit(result, agentArgs, { human: () => result.message });
      return;
    }
    // env-first: do not write to disk. Hand the cookie header to the user to
    // place in their environment.
    instructEnvSecret(
      envVar,
      cookieHeader,
      "Imported browser session cookies are bearer credentials — anyone with them can act as your logged-in session.",
    );
    const result = {
      ok: true,
      envVar,
      status: "instructed",
      message: `Add ${envVar} to your environment (printed above), then \`source\` it and run \`restaurant doctor\`.`,
    };
    emit(result, agentArgs, { human: () => result.message });
  },
});

const statusCmd = defineCommand({
  meta: {
    name: "status",
    description: "Show which providers have stored session cookies",
  },
  args: { ...AGENT_ARGS },
  run({ args }) {
    const agentArgs = parseAgentArgs(
      args as unknown as Record<string, unknown>,
    );
    const rows = [...KNOWN_PROVIDERS].map((id) => ({
      provider: id,
      envVar: envVarFor(id),
      loaded: Boolean(process.env[envVarFor(id)]),
    }));
    emit(rows, agentArgs, {
      human: (xs) =>
        xs.map(
          (r) =>
            `${r.provider}: ${r.loaded ? "loaded from env" : "missing (set " + r.envVar + ")"}`,
        ),
    });
  },
});

export const authCommand = defineCommand({
  meta: {
    name: "auth",
    description: "Manage browser-session cookies for OpenTable and Tock",
  },
  subCommands: {
    login: loginCmd,
    status: statusCmd,
  },
});
