import { handleRouteError, ok } from "@/lib/api";
import { lookupOfficialSeal } from "@/lib/official-registry";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const result = await lookupOfficialSeal(query, url.origin);
    const { recordId: _recordId, ...publicResult } = result;
    return ok({ result: publicResult });
  } catch (error) {
    return handleRouteError(error);
  }
}
