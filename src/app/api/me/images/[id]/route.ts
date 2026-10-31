import { imageRoutes } from "@/lib/server/libraryHttp";

/**
 * /api/me/images/:id — one of the signed-in account's comic images.
 * GET: the bytes (never cached by a shared cache). PUT: raw PNG, JPEG or WebP
 * bytes with a Content-Length, at most 8 MB; stored exactly as sent.
 * Another account's image id answers 404.
 */
export const { GET, PUT } = imageRoutes;
