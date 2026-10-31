import { recordRoutes } from "@/lib/server/libraryHttp";

/**
 * /api/me/days/:id — one of the signed-in account's days.
 * GET: the day as JSON. PUT: save it (JSON, at most 256 KB; an older copy than
 * the stored one gets 409). DELETE ?at=<ISO time>: delete it and its images,
 * leaving a tombstone for other devices. Another account's id answers 404.
 */
export const { GET, PUT, DELETE } = recordRoutes("days");
