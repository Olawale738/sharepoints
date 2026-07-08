import { handleRouteError, ok, requireUser } from "@/lib/api";
import { getLeadershipDirectory } from "@/lib/leadership-suite";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getLeadershipDirectory(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}
