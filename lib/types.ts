import type { UIMessagePart } from "ai";
import type { ObjectId } from "mongodb";

export interface StoredMessage {
  _id?: ObjectId;
  userId: string;
  role: "user" | "assistant";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parts: UIMessagePart<any, any>[];
  createdAt: Date;
}
