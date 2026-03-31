import { auth } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { redirect } from "next/navigation";
import ChatClient from "./ChatClient";
import type { StoredMessage } from "@/lib/types";
import type { UIMessage } from "ai";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const db = await getDb();
  const rawMessages = await db
    .collection<StoredMessage>("messages")
    .find({ userId })
    .sort({ createdAt: 1 })
    .toArray();

  const initialMessages: UIMessage[] = rawMessages.map((m) => ({
    id: m._id!.toString(),
    role: m.role,
    parts: m.parts,
  }));

  return (
    <ChatClient
      initialMessages={initialMessages}
      user={{
        name: session.user.name ?? "User",
        image: session.user.image ?? undefined,
      }}
    />
  );
}
