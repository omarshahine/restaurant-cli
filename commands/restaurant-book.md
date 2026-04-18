---
description: Book a restaurant reservation now (not a snipe — immediate booking)
---

# Restaurant Book

Delegate to the `restaurant-router` agent with an explicit "book now" intent:

```
The user wants to BOOK (not snipe) a reservation immediately. Arguments: $ARGUMENTS
```

Router protocol summary:
1. Run `restaurant doctor` to pick a provider with `book` capability.
2. If the user gave a name not an id, search first and confirm the venue.
3. Run `restaurant availability` to see open slots; present options via AskUserQuestion if the user's chosen time isn't already pinned.
4. Run `restaurant book` with the user's answer. **Always let the CLI prompt for y/N** unless the user has explicitly confirmed the booking in chat.

For OpenTable venues, the router will degrade gracefully to a deep-link hand-off (see `opentable-agent`).
