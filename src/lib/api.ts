import { auth } from "@/auth";
import { ApiError } from "@/lib/errors";

export { ApiError };

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json(data, init);
}

export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function requireUser() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new ApiError(401, "Authentication required.");
  }

  return session.user;
}

export function handleRouteError(error: unknown) {
  if (error instanceof ApiError) {
    return fail(error.message, error.status);
  }

  if (error instanceof Error) {
    return fail(error.message, 400);
  }

  return fail("Unexpected request failure.", 500);
}
