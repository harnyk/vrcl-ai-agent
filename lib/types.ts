import type { ObjectId } from "mongodb";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string; // ISO string — safe across server→client boundary
}

export interface StoredMessage {
  _id?: ObjectId;
  userId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}
