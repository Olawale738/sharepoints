import "server-only";

import { Prisma } from "@prisma/client";

import { ApiError, handleRouteError } from "@/lib/api";

export const ACADEMIC_OPS_SETUP_MESSAGE =
  "Academic operations database setup is pending. Apply the academic operations migration, then refresh this page.";

export function isAcademicOpsSchemaNotReady(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2022";
  }

  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist in the current database") ||
    message.includes("relation") && message.includes("does not exist") ||
    message.includes("table") && message.includes("does not exist") ||
    message.includes("column") && message.includes("does not exist")
  );
}

export function handleAcademicOpsRouteError(error: unknown) {
  if (isAcademicOpsSchemaNotReady(error)) {
    return handleRouteError(new ApiError(503, ACADEMIC_OPS_SETUP_MESSAGE));
  }

  return handleRouteError(error);
}
