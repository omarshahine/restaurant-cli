import { Type, type Static } from "@sinclair/typebox";

/** Credentials as stored in ~/.secrets.env + config.yaml. */
export const ResyCredentialsSchema = Type.Object({
  apiKey: Type.String({ description: "Resy public API key (see resy-cli setup docs)" }),
  authToken: Type.String({ description: "Per-user auth token from Resy DevTools" }),
  email: Type.Optional(Type.String()),
});
export type ResyCredentials = Static<typeof ResyCredentialsSchema>;

export const ResyVenueSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  city: Type.Optional(Type.String()),
  region: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
});
export type ResyVenue = Static<typeof ResyVenueSchema>;
