import { recordRoutes } from "@/lib/server/libraryHttp";

/**
 * /api/me/cast/:id — one of the signed-in account's characters (with their
 * sheet tokens, file tokens and sprite sheet). GET, PUT, DELETE ?at= as for days.
 */
export const { GET, PUT, DELETE } = recordRoutes("cast");
