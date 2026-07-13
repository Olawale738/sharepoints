import { GET as getShareLink } from "../download/route";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  return getShareLink(request, context);
}
