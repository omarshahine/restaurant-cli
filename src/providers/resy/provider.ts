import type { Provider } from "../types.js";
import { loginResy, resySetupPrompts, validateResy } from "./auth.js";
import { searchVenues } from "./search.js";
import { getAvailability } from "./availability.js";
import { book } from "./book.js";
import { cancel, listReservations } from "./cancel.js";

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
    availability: false, // M2
    book: false, // M2
    cancel: false, // M2
    list: false, // M2
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
