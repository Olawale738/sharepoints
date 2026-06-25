import { handleRouteError, ok } from "@/lib/api";
import { publicCredentialJwks } from "@/lib/verifiable-credentials";

export async function GET() {
  try {
    return ok(await publicCredentialJwks(), {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
