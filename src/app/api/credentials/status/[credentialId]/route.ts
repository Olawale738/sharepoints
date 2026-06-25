import { handleRouteError, ok } from "@/lib/api";
import { membershipCredentialStatus } from "@/lib/verifiable-credentials";

type RouteContext = {
  params: Promise<{ credentialId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { credentialId } = await context.params;
    return ok(await membershipCredentialStatus(credentialId), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
