import { roundUsd, type MyCosts } from "@/lib/costs";
import { ledgerOf, summarizeAccount } from "@/lib/server/costs";
import { requireSession } from "@/lib/server/session";

/**
 * GET /api/me/costs: the signed-in account's own totals from the server's
 * cost ledger (deleted days included). Only ever the caller's account.
 */
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  try {
    const summary = summarizeAccount(await ledgerOf(session.account.id));
    const body: MyCosts = {
      comics: summary.comics.length,
      comicsUsd: roundUsd(summary.comics.reduce((sum, comic) => sum + comic.cost.usd, 0)),
      castUsd: summary.setup.usd,
      extrasUsd: summary.extras.usd,
      totalUsd: summary.total.usd,
    };
    return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(`Comimo: cost summary failed (${error instanceof Error ? error.name : "unknown"})`);
    return Response.json({ error: "Costs aren't available right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
