import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { adminTools } from "@/lib/tools";
import type { StoredMessage } from "@/lib/types";
import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";

  const { messages } = (await req.json()) as { messages: UIMessage[] };
  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user")
    return new Response("Bad Request", { status: 400 });

  const db = await getDb();
  const col = db.collection<StoredMessage>("messages");

  // Save user message parts
  await col.insertOne({
    userId,
    role: "user",
    parts: lastMessage.parts,
    createdAt: new Date(),
  });

  // Load full history as UIMessage[]
  // Strip providerOptions and null providerExecuted — OpenAI tracking fields
  // that cause ModelMessage schema validation to fail on replay.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sanitizePart(part: any): any {
    const { providerOptions: _po, providerExecuted, ...rest } = part;
    return typeof providerExecuted === "boolean"
      ? { ...rest, providerExecuted }
      : rest;
  }

  const rawHistory = await col.find({ userId }).sort({ createdAt: 1 }).toArray();
  const uiHistory: UIMessage[] = rawHistory.map((m) => ({
    id: m._id!.toString(),
    role: m.role,
    parts: m.parts.map(sanitizePart),
  }));

  const tools = isAdmin ? adminTools : undefined;

  const userInfo = `Current user:\n- Name: ${session.user.name ?? "Unknown"}\n- Email: ${session.user.email ?? "Unknown"}\n- Role: ${session.user.role}`;
  const systemPrompt = isAdmin
    ? `You are a helpful assistant. You also have admin tools to manage user access: add_user, list_users, block_user, unblock_user. Use them when the user asks to manage access.\n\n${userInfo}`
    : `You are a helpful assistant. Be concise and friendly.\n\n${userInfo}`;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
        system: systemPrompt,
        messages: await convertToModelMessages(uiHistory, { tools }),
        tools,
        stopWhen: stepCountIs(5),
      });
      result.consumeStream();
      writer.merge(result.toUIMessageStream({ sendStart: false }));
    },
    originalMessages: uiHistory,
    onFinish: async ({ responseMessage }) => {
      await col.insertOne({
        userId,
        role: "assistant",
        parts: responseMessage.parts,
        createdAt: new Date(),
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function DELETE(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  await db.collection("messages").deleteMany({ userId: session.user.id });
  return new Response(null, { status: 204 });
}
