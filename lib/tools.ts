import { addUser, listUsers, blockUser, unblockUser } from "@/lib/users";
import { tool } from "ai";
import { z } from "zod";

export const adminTools = {
  add_user: tool({
    description: "Add a user by email to grant them access to the app",
    inputSchema: z.object({ email: z.string() }),
    execute: async ({ email }) => addUser(email),
  }),
  list_users: tool({
    description: "List all users who have been granted access",
    inputSchema: z.object({}),
    execute: async () => {
      const users = await listUsers();
      return users.map((u) => ({
        email: u.email,
        blocked: u.blocked,
        createdAt: u.createdAt.toISOString(),
      }));
    },
  }),
  block_user: tool({
    description: "Block a user by email, revoking their access",
    inputSchema: z.object({ email: z.string() }),
    execute: async ({ email }) => blockUser(email),
  }),
  unblock_user: tool({
    description: "Unblock a user by email, restoring their access",
    inputSchema: z.object({ email: z.string() }),
    execute: async ({ email }) => unblockUser(email),
  }),
};
