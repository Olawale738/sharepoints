import "dotenv/config";
import { hash } from "bcryptjs";
import { WorkspaceRole } from "@prisma/client";

import { getOrCreateGeneralChannel } from "../src/lib/chat";
import { prisma } from "../src/lib/prisma";

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "president@letw.org";
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const legacyAdminEmail = "admin@letw.org";

async function main() {
  if (!adminPassword) {
    throw new Error("SEED_ADMIN_PASSWORD is required to seed the admin account.");
  }

  const passwordHash = await hash(adminPassword, 12);
  const legacyAdmin = await prisma.user.findUnique({
    where: { email: legacyAdminEmail }
  });
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail }
  });

  const admin =
    legacyAdmin && !existingAdmin
      ? await prisma.user.update({
          where: { id: legacyAdmin.id },
          data: {
            name: "LETW Admin",
            email: adminEmail,
            passwordHash
          }
        })
      : await prisma.user.upsert({
          where: { email: adminEmail },
          update: {
            name: "LETW Admin",
            passwordHash
          },
          create: {
            name: "LETW Admin",
            email: adminEmail,
            passwordHash
          }
        });

  const workspace = await prisma.workspace.upsert({
    where: { slug: "letw-central" },
    update: {
      name: "LETW Central",
      description: "Organization-wide collaboration space for LETW documents, folders, and shared work."
    },
    create: {
      name: "LETW Central",
      slug: "letw-central",
      description: "Organization-wide collaboration space for LETW documents, folders, and shared work.",
      createdById: admin.id,
      members: {
        create: {
          userId: admin.id,
          role: WorkspaceRole.ADMIN
        }
      }
    }
  });

  await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: admin.id,
        workspaceId: workspace.id
      }
    },
    update: {
      role: WorkspaceRole.ADMIN
    },
    create: {
      userId: admin.id,
      workspaceId: workspace.id,
      role: WorkspaceRole.ADMIN
    }
  });

  await prisma.companyEmailInvitation.upsert({
    where: {
      email: adminEmail
    },
    update: {
      invitedById: admin.id,
      acceptedById: admin.id,
      acceptedAt: new Date(),
      revokedAt: null
    },
    create: {
      id: "company-invite-president-letw-org",
      email: adminEmail,
      invitedById: admin.id,
      acceptedById: admin.id,
      acceptedAt: new Date()
    }
  });
  await prisma.companyEmailInvitation.updateMany({
    where: {
      email: legacyAdminEmail
    },
    data: {
      revokedAt: new Date()
    }
  });

  for (const name of ["Policies", "Templates", "Programs"]) {
    await prisma.folder.upsert({
      where: {
        id: `${workspace.id}-${name.toLowerCase()}`
      },
      update: {
        name
      },
      create: {
        id: `${workspace.id}-${name.toLowerCase()}`,
        workspaceId: workspace.id,
        name,
        createdById: admin.id
      }
    });
  }

  const channel = await getOrCreateGeneralChannel(workspace.id, admin.id);

  await prisma.chatMessage.upsert({
    where: {
      id: `${channel.id}-welcome`
    },
    update: {
      body: "Welcome to LETW Central. Use this channel for workspace updates, quick questions, and integration alerts."
    },
    create: {
      id: `${channel.id}-welcome`,
      channelId: channel.id,
      authorId: admin.id,
      body: "Welcome to LETW Central. Use this channel for workspace updates, quick questions, and integration alerts."
    }
  });

  await prisma.activityLog.create({
    data: {
      userId: admin.id,
      workspaceId: workspace.id,
      action: "workspace.created",
      targetId: workspace.id,
      metadata: {
        seeded: true,
        name: workspace.name
      }
    }
  });

  console.log("Seed complete.");
  console.log(`Email: ${adminEmail}`);
  console.log("Password: configured from SEED_ADMIN_PASSWORD");
  console.log(`Workspace: ${workspace.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
