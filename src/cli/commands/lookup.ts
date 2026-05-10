import { defineCommand } from "citty";
import { lookupRestaurantId } from "../../providers/opentable/api.js";
import { AGENT_ARGS, emit, parseAgentArgs } from "../output.js";

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
      description: "URL slug from opentable.com/r/<slug>, e.g. 'carbone-new-york'",
      required: true,
    },
    ...AGENT_ARGS,
  },
  async run({ args }) {
    const agentArgs = parseAgentArgs(args as unknown as Record<string, unknown>);
    const result = await lookupRestaurantId(args.slug);
    emit(result, agentArgs, {
      human: () => {
        const name = result.name ? ` — ${result.name}` : "";
        return `${result.restaurantId}  (${result.slug})${name}`;
      },
    });
  },
});
