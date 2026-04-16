import type { AuthStatus, Credentials, SetupPrompt } from "../types.js";
import { ResyClient } from "./client.js";
import type { ResyCredentials } from "./schemas.js";

export function resyCredentials(creds: Credentials): ResyCredentials {
  const apiKey = creds["apiKey"];
  const authToken = creds["authToken"];
  if (!apiKey) throw new Error("Missing Resy apiKey");
  if (!authToken) throw new Error("Missing Resy authToken");
  return {
    apiKey,
    authToken,
    ...(creds["email"] ? { email: creds["email"] } : {}),
  };
}

export async function validateResy(creds: Credentials): Promise<AuthStatus> {
  try {
    const typed = resyCredentials(creds);
    const client = new ResyClient(typed);
    const me = (await client.whoami()) as { email?: string; first_name?: string } | null;
    return {
      ok: true,
      detail: me?.email ?? me?.first_name ?? "authenticated",
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function resySetupPrompts(): SetupPrompt[] {
  return [
    {
      id: "email",
      label: "Resy email address",
      sensitive: false,
    },
    {
      id: "apiKey",
      label: "Resy public API key",
      help: "Open resy.com in your browser, DevTools → Network → any API request → copy the api_key value from the Authorization header (ResyAPI api_key=\"...\")",
      sensitive: true,
      envVar: "RESY_API_KEY",
    },
    {
      id: "authToken",
      label: "Resy auth token",
      help: "In the same DevTools session, copy the value of the X-Resy-Auth-Token request header.",
      sensitive: true,
      envVar: "RESY_AUTH_TOKEN",
    },
  ];
}
