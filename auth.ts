import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { SecurityEventType } from "@prisma/client";

import { isBlockedServiceEmail, markCompanyInvitationAccepted } from "@/lib/email-policy";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security";
import { loginSchema } from "@/lib/validators";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" }
    },
    async authorize(rawCredentials) {
      const parsed = loginSchema.safeParse(rawCredentials);

      if (!parsed.success) {
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email.toLowerCase() }
      });

      if (!user?.passwordHash) {
        await logSecurityEvent({
          type: SecurityEventType.LOGIN_FAILED,
          email: parsed.data.email,
          metadata: { reason: "unknown_user_or_password_missing" }
        });
        return null;
      }

      if (user.suspendedAt || user.accessRevokedAt || user.deletedAt || user.forcePasswordReset) {
        await logSecurityEvent({
          userId: user.id,
          type: SecurityEventType.LOGIN_FAILED,
          email: user.email,
          metadata: {
            reason: user.forcePasswordReset ? "force_password_reset" : "restricted_account"
          }
        });
        return null;
      }

      const passwordMatches = await compare(parsed.data.password, user.passwordHash);

      if (!passwordMatches) {
        await logSecurityEvent({
          userId: user.id,
          type: SecurityEventType.LOGIN_FAILED,
          email: user.email,
          metadata: { reason: "invalid_password" }
        });
        return null;
      }

      await logSecurityEvent({
        userId: user.id,
        type: SecurityEventType.LOGIN_SUCCESS,
        email: user.email
      });

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image
      };
    }
  })
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login"
  },
  providers,
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();

      return !(await isBlockedServiceEmail(email, user.id));
    },
    async jwt({ token, user }) {
      const email = user?.email ?? token.email;
      const userId = user?.id ?? (typeof token.id === "string" ? token.id : undefined);
      token.companyAccessBlocked = await isBlockedServiceEmail(email, userId);

      if (token.companyAccessBlocked) {
        delete token.id;
        return token;
      }

      if (!userId) {
        return token;
      }

      const persistedUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          suspendedAt: true,
          accessRevokedAt: true,
          deletedAt: true,
          forcePasswordReset: true,
          singleActiveSession: true,
          sessionVersion: true
        }
      });

      if (
        !persistedUser ||
        persistedUser.suspendedAt ||
        persistedUser.accessRevokedAt ||
        persistedUser.deletedAt ||
        persistedUser.forcePasswordReset
      ) {
        delete token.id;
        token.companyAccessBlocked = true;
        return token;
      }

      if (user?.id) {
        token.id = user.id;
        if (persistedUser.singleActiveSession) {
          const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
              sessionVersion: {
                increment: 1
              }
            },
            select: {
              sessionVersion: true
            }
          });
          token.sessionVersion = updatedUser.sessionVersion;
        } else {
          token.sessionVersion = persistedUser.sessionVersion;
        }
        await markCompanyInvitationAccepted(email, user.id);
      } else {
        if (typeof token.sessionVersion === "number" && token.sessionVersion !== persistedUser.sessionVersion) {
          delete token.id;
          token.companyAccessBlocked = true;
          return token;
        }

        token.id = persistedUser.id;
        token.sessionVersion = persistedUser.sessionVersion;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.companyAccessBlocked ? "" : String(token.id ?? token.sub);
      }

      return session;
    }
  }
});
