import { createHash, timingSafeEqual } from "node:crypto";
import { sweepDeletions } from "@/lib/server/accountDeletion";

/**
 * POST /api/maintenance/deletions
 * Authorization: Bearer <COMIMO_MAINTENANCE_SECRET>
 * Finishes account deletions that stopped part way (safe to run any time, e.g.
 * from a Vercel cron). Without the secret configured the route doesn't exist (404).
 */
function authorized(request: Request): boolean | null {
  const secret = process.env.COMIMO_MAINTENANCE_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const allowed = authorized(request);
  if (allowed === null) return new Response("Not found", { status: 404 });
  if (!allowed) return Response.json({ error: "Not allowed." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return Response.json(await sweepDeletions(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Comimo: deletion sweep failed (${error instanceof Error ? error.name : "unknown"})`);
    return Response.json({ error: "The sweep couldn't run." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
