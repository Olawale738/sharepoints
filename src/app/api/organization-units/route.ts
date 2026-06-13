import { handleRouteError, ok, requireUser } from "@/lib/api";
import { getOrganizationUnitAccess } from "@/lib/organization-access";

export async function GET() {
  try {
    const user = await requireUser();
    const access = await getOrganizationUnitAccess(user.id);

    return ok({
      isAdmin: access.isAdmin,
      units: access.units.map((unit) => ({
        id: unit.id,
        parentId: unit.parentId,
        type: unit.type,
        name: unit.name,
        countryCode: unit.countryCode,
        canCreateWorkspace: access.creatableUnitIds.has(unit.id)
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
