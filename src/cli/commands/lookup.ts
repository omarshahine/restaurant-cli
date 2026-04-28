import { defineCommand } from "citty";
import { lookupRestaurantId } from "../../providers/opentable/api.js";

/**
 * Resolve an OpenTable URL slug to its numeric restaurant ID.
 *
 * Useful when the user already knows the venue from opentable.com
 * (`opentable.com/r/<slug>`) and wants to skip browser-driven search. The ID
 * can then be passed to `restaurant availability --venue <id>`.
 *
 * Provider-scoped: only OpenTable URL slugs work here. Resy uses a different
 * URL shape and has a working text-search API, so this command is OT-only.
 */
export const lookupCommand = defineCommand({
  meta: {
    name: "lookup",
    description: "Resolve an OpenTable URL slug to its numeric restaurant ID",
  },
  args: {
    slug: {
      type: "string",
      description:
        "URL slug from opentable.com/r/<slug>, e.g. 'carbone-new-york'",
      required: true,
    },
    json: { type: "boolean", description: "Output raw JSON" },
  },
  async run({ args }) {
    const result = await lookupRestaurantId(args.slug);
    if (args.json) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    const name = result.name ? ` — ${result.name}` : "";
    // eslint-disable-next-line no-console
    console.log(`${result.restaurantId}  (${result.slug})${name}`);
  },
});
