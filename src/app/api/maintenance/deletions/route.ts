import { sweepDeletions } from "@/lib/server/accountDeletion";
import { maintenanceAuthorized } from "@/lib/server/maintenance";

/**
 * POST /api/maintenance/deletions
 * Authorization: Bearer <COMIMO_MAINTENANCE_SECRET>
 * Finishes account deletions that stopped part way (safe to run any time, e.g.
 * from a Vercel cron). Without the secret configured the route doesn't exist (404).
 */
export async function POST(request: Request) {
  const allowed = maintenanceAuthorized(request);
  if (allowed === null) return new Response("Not found", { status: 404 });
  if (!allowed) return Response.json({ error: "Not allowed." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return Response.json(await sweepDeletions(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Comimo: deletion sweep failed (${error instanceof Error ? error.name : "unknown"})`);
    return Response.json({ error: "The sweep couldn't run." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
