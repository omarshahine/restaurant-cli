import type { Provider } from "../types.js";
import { loginResy, resySetupPrompts, validateResy } from "./auth.js";
import { searchVenues } from "./search.js";
import { getAvailability } from "./availability.js";
import { book } from "./book.js";
import { cancel } from "./cancel.js";
import { listReservations } from "./list.js";

/**
 * The Resy provider — first concrete implementation of the `Provider`
 * interface. Every future platform (OpenTable, Tock, SevenRooms, ...) will
 * look structurally identical to this file.
 */
export const resyProvider: Provider = {
  id: "resy",
  displayName: "Resy",
  capabilities: {
    search: true,
    availability: true,
    book: true,
    cancel: true,
    list: true,
    snipe: true, // supported by Resy's release-time model
  },
  auth: {
    validate: validateResy,
    setupPrompts: resySetupPrompts,
    login: loginResy,
  },
  searchVenues,
  getAvailability,
  book,
  cancel,
  listReservations,
};
