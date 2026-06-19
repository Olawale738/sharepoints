import { handleRouteError, ok, requireUser } from "@/lib/api";
import { effectiveAssignmentStatus } from "@/lib/compliance";
import { memberEditableProfileFields, memberProfileAnswers } from "@/lib/member-profile-fields";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requireUser();
    const isAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const assignments = await prisma.memberComplianceAssignment.findMany({
      where: { userId: user.id },
      include: {
        campaign: {
          include: {
            createdBy: { select: { name: true, email: true } }
          }
        },
        sanctions: {
          where: {
            status: "ACTIVE",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    const profile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
    const adminData = isAdmin
      ? await Promise.all([
          prisma.memberComplianceCampaign.findMany({
            include: {
              createdBy: { select: { name: true, email: true } },
              assignments: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      image: true,
                      department: { select: { name: true } },
                      workspaceMemberships: { select: { role: true } }
                    }
                  },
                  sanctions: {
                    where: {
                      status: "ACTIVE",
                      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
                    },
                    orderBy: { createdAt: "desc" }
                  }
                },
                orderBy: { createdAt: "asc" }
              }
            },
            orderBy: { createdAt: "desc" },
            take: 100
          }),
          prisma.user.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true, email: true, departmentId: true },
            orderBy: { name: "asc" },
            take: 500
          }),
          prisma.department.findMany({
            select: { id: true, name: true, kind: true },
            orderBy: { name: "asc" }
          }),
          prisma.workspace.findMany({
            where: { deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" }
          }),
          prisma.memberSanction.findMany({
            where: {
              status: "ACTIVE",
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
            },
            include: {
              user: { select: { name: true, email: true } },
              issuedBy: { select: { name: true, email: true } }
            },
            orderBy: { createdAt: "desc" },
            take: 100
          }),
          prisma.workspaceFormResponse.findMany({
            include: {
              respondent: { select: { id: true, name: true, email: true, image: true } },
              form: {
                select: {
                  id: true,
                  title: true,
                  fields: true,
                  workspace: { select: { id: true, name: true } }
                }
              }
            },
            orderBy: { updatedAt: "desc" },
            take: 500
          })
        ])
      : null;

    return ok({
      isAdmin,
      fieldCatalog: memberEditableProfileFields,
      profileAnswers: memberProfileAnswers(profile),
      assignments: assignments.map((assignment) => ({
        ...assignment,
        effectiveStatus: effectiveAssignmentStatus(assignment)
      })),
      admin: adminData
        ? {
            campaigns: adminData[0].map((campaign) => ({
              ...campaign,
              assignments: campaign.assignments.map((assignment) => ({
                ...assignment,
                effectiveStatus: effectiveAssignmentStatus({
                  status: assignment.status,
                  campaign: { status: campaign.status, dueAt: campaign.dueAt }
                })
              }))
            })),
            users: adminData[1],
            departments: adminData[2],
            workspaces: adminData[3],
            sanctions: adminData[4],
            workspaceFormResponses: adminData[5]
          }
        : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
