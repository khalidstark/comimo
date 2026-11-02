import { aggregateCosts, ledgerAccounts, ledgerOf, summarizeAccount } from "@/lib/server/costs";
import { maintenanceAuthorized } from "@/lib/server/maintenance";

/**
 * GET /api/maintenance/costs
 * Authorization: Bearer <COMIMO_MAINTENANCE_SECRET>
 * The owner's cost analytics across every account, from the server ledger:
 * comics, cost per comic (mean, median, p90), per panel, per step, per art
 * style, calls per comic, onboarding (cast work) per account, by month. No
 * account ids, emails or story text in it. Without the secret configured the
 * route doesn't exist (404).
 */
export async function GET(request: Request) {
  const allowed = maintenanceAuthorized(request);
  if (allowed === null) return new Response("Not found", { status: 404 });
  if (!allowed) return Response.json({ error: "Not allowed." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const summaries = await Promise.all((await ledgerAccounts()).map(async (account) => summarizeAccount(await ledgerOf(account))));
    return Response.json({ generatedAt: new Date().toISOString(), ...aggregateCosts(summaries) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(`Comimo: cost analytics failed (${error instanceof Error ? error.name : "unknown"})`);
    return Response.json({ error: "The costs couldn't be read." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
