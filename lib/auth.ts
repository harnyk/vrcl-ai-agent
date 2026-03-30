import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb";
import { findUser } from "@/lib/users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise, {
    collections: {
      Accounts: "auth_accounts",
      Sessions: "auth_sessions",
      Users: "auth_users",
      VerificationTokens: "auth_verification_tokens",
    },
  }),
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  ],
  session: {
    strategy: "database",
  },
  callbacks: {
    async signIn({ user }) {
      const adminEmail = process.env.ADMIN_EMAIL;

      // Always allow admin
      if (adminEmail && user.email === adminEmail) return true;

      // Allow users who are in the app_users collection and not blocked
      if (user.email) {
        const appUser = await findUser(user.email);
        if (appUser && !appUser.blocked) return true;
      }

      return "/login?error=AccessDenied";
    },
    session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
        session.user.role =
          user.email === process.env.ADMIN_EMAIL ? "admin" : "user";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "user";
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
