import type { Provider } from "../types.js";
import { tockSetupPrompts, validateTock } from "./auth.js";
import { searchVenues } from "./search.js";
import { getAvailability } from "./availability.js";
import { book } from "./book.js";
import { cancel } from "./cancel.js";
import { listReservations } from "./list.js";

/**
 * Tock provider.
 *
 * Capability split:
 *   - search, availability   → anonymous, no auth needed
 *   - list, cancel           → requires sessionCookies (auth login tock)
 *   - book                   → default-OFF (browser path not yet built;
 *                              gated by RESTAURANT_CLI_TOCK_ALLOW_BOOK)
 *   - snipe                  → off until book is real (snipe self-invokes book)
 */
export const tockProvider: Provider = {
  id: "tock",
  displayName: "Tock",
  capabilities: {
    search: true,
    availability: true,
    book: false,
    cancel: true,
    list: true,
    snipe: false,
  },
  auth: {
    validate: validateTock,
    setupPrompts: tockSetupPrompts,
  },
  searchVenues,
  getAvailability,
  book,
  cancel,
  listReservations,
};
