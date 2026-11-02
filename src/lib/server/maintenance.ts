import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The owner's maintenance routes: Authorization: Bearer <COMIMO_MAINTENANCE_SECRET>.
 * Null when no secret (of at least 32 characters) is configured: the routes then don't exist (404).
 */
export function maintenanceAuthorized(request: Request): boolean | null {
  const secret = process.env.COMIMO_MAINTENANCE_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
