/**
 * Tock-specific credential shape. Reads `authToken` (the Auth0 access token,
 * if available) and `sessionCookies` (the Cookie header string from
 * `restaurant auth login`). Tock anonymous reads work without either; book
 * and list require sessionCookies.
 */

export interface TockCredentials {
  /** Optional Auth0 bearer token (rare — most flows use cookies). */
  authToken?: string;
  /** Full `Cookie:` header string from a logged-in exploretock.com session. */
  sessionCookies?: string;
  email?: string;
}
