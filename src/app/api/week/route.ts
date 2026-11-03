import { guard, guardResponse, withCost } from "@/lib/guard";
import { getModels } from "@/lib/models";
import { isRecord, isText, json, jsonError, modelErrorResponse } from "@/lib/models/wire";
import { BODY_LIMITS, readBoundedJson } from "@/lib/requestBody";
import { requireSession } from "@/lib/server/session";
import type { WeekRequest, WeekResponse } from "@/lib/types";

/** One Muse Spark call with a 60 s timeout and one retry. */
export const maxDuration = 300;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 14;
const MAX_TEXT = 1500;

function parseWeek(body: unknown): WeekRequest | null {
  if (!isRecord(body) || typeof body.week !== "string" || !DATE.test(body.week)) return null;
  if (!Array.isArray(body.days) || body.days.length === 0 || body.days.length > MAX_DAYS) return null;
  const days: WeekRequest["days"] = [];
  for (const item of body.days) {
    if (!isRecord(item)) return null;
    const { id, date, title, text, scenes } = item;
    if (!isText(id, 100) || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/.test(id)) return null;
    if (typeof date !== "string" || !DATE.test(date)) return null;
    if (typeof title !== "string" || title.length > 200 || typeof text !== "string" || text.length > MAX_TEXT) return null;
    if (scenes !== undefined && (!Array.isArray(scenes) || scenes.length > 18 || scenes.some((s) => typeof s !== "string" || s.length > 200))) return null;
    days.push({ id, date, title: title.trim(), text: text.trim(), ...(Array.isArray(scenes) ? { scenes: scenes as string[] } : {}) });
  }
  return { week: body.week, days };
}

/**
 * POST /api/week
 * JSON: WeekRequest (the week's comics: id, date, title, the user's own words cut to 1500 characters).
 * Muse Spark picks out the good things of the week (what they did, what went
 * well for them), each tied to its comic. No advice, no scores. One guarded,
 * metered text call; the browser keeps the answer with the account.
 */
export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session.ok) return session.response;
  const read = await readBoundedJson(request, BODY_LIMITS.script);
  if (!read.ok) return read.response;
  const week = parseWeek(read.value);
  if (!week) return jsonError(400, "Send the week's comics: {\"week\": \"YYYY-MM-DD\", \"days\": [{id, date, title, text}]}.");

  const models = getModels();
  const source = models.sources.week;
  const check = await guard(request, "week", { real: source === "meta" });
  if (!check.ok) return guardResponse(check);

  try {
    const answer = await models.writeWeek(week, { visitorId: check.visitorId, signal: request.signal, meter: check.meter });
    return withCost(json<WeekResponse>({ mode: source, ...answer }, source), check.meter);
  } catch (error) {
    check.refundIfUnbilled();
    return withCost(modelErrorResponse(error), check.meter);
  }
}
