import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { addUser, listUsers, blockUser, unblockUser } from "@/lib/users";
import { openai } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import type { StoredMessage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";

  // AI SDK 6 sends UIMessage[] with parts arrays
  const { messages } = await req.json();
  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") {
    return new Response("Bad Request", { status: 400 });
  }

  // Extract plain text from the UIMessage parts array
  const textContent: string = (lastMessage.parts as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");

  const db = await getDb();
  const col = db.collection<StoredMessage>("messages");

  await col.insertOne({
    userId,
    role: "user",
    content: textContent,
    createdAt: new Date(),
  });

  // Load full history from DB as the source of truth
  const history = await col.find({ userId }).sort({ createdAt: 1 }).toArray();
  const modelMessages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const adminTools = isAdmin
    ? {
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
      }
    : undefined;

  const userInfo = `
Current user:
- Name: ${session.user.name ?? "Unknown"}
- Email: ${session.user.email ?? "Unknown"}
- Role: ${session.user.role}`.trim();

  const systemPrompt = isAdmin
    ? `You are a helpful assistant. You also have admin tools to manage user access: add_user, list_users, block_user, unblock_user. Use them when the user asks to manage access.\n\n${userInfo}`
    : `You are a helpful assistant. Be concise and friendly.\n\n${userInfo}`;

  const result = streamText({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    system: systemPrompt,
    messages: modelMessages,
    tools: adminTools,
    stopWhen: stepCountIs(5),
    onFinish: async ({ text }) => {
      if (text) {
        await col.insertOne({
          userId,
          role: "assistant",
          content: text,
          createdAt: new Date(),
        });
      }
    },
  });

  return result.toUIMessageStreamResponse();
}

export async function DELETE(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = await getDb();
  await db.collection("messages").deleteMany({ userId: session.user.id });

  return new Response(null, { status: 204 });
}
