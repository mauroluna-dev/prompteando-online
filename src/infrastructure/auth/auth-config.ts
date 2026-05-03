import type { AuthConfig } from "@auth/core";
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/infrastructure/persistence/db";
import { env } from "@/infrastructure/config/env";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/infrastructure/persistence/schema";

export const authConfig: AuthConfig = {
  basePath: "/auth",
  trustHost: true,
  secret: env.AUTH_SECRET,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: "read:user user:email" } },
      // Both providers verify email server-side (Google always; GitHub
      // when the primary email is marked verified). Linking by email
      // unifies identity so the same person doesn't end up with two
      // user rows.
      allowDangerousEmailAccountLinking: true,
    }),
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    // Auth.js v5 default omits `user.id` from the /auth/session
    // response. Expose it so the frontend (and our /api/me query)
    // can identify the user.
    session({ session, user }) {
      return {
        ...session,
        user: { ...session.user, id: user.id },
      };
    },
  },
};
