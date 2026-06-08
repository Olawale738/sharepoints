import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";

import { isBlockedServiceEmail, markCompanyInvitationAccepted } from "@/lib/email-policy";
import { prisma } from "@/lib/prisma";
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
        return null;
      }

      if (user.suspendedAt || user.accessRevokedAt || user.deletedAt) {
        return null;
      }

      const passwordMatches = await compare(parsed.data.password, user.passwordHash);

      if (!passwordMatches) {
        return null;
      }

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

      if (user?.id) {
        token.id = user.id;
        await markCompanyInvitationAccepted(email, user.id);
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
