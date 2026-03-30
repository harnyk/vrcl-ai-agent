import { getDb } from "@/lib/mongodb";

export interface AppUser {
  email: string;
  blocked: boolean;
  createdAt: Date;
}

const COL = "app_users";

export async function findUser(email: string): Promise<AppUser | null> {
  const db = await getDb();
  return db.collection<AppUser>(COL).findOne({ email });
}

export async function addUser(email: string): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const existing = await db.collection<AppUser>(COL).findOne({ email });
  if (existing) {
    return { ok: false, message: `${email} already exists` };
  }
  await db.collection<AppUser>(COL).insertOne({
    email,
    blocked: false,
    createdAt: new Date(),
  });
  return { ok: true, message: `${email} added successfully` };
}

export async function listUsers(): Promise<AppUser[]> {
  const db = await getDb();
  return db.collection<AppUser>(COL).find({}).sort({ createdAt: 1 }).toArray();
}

export async function blockUser(email: string): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const result = await db.collection<AppUser>(COL).updateOne(
    { email },
    { $set: { blocked: true } }
  );
  if (result.matchedCount === 0) {
    return { ok: false, message: `User ${email} not found` };
  }
  return { ok: true, message: `${email} blocked` };
}

export async function unblockUser(email: string): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  const result = await db.collection<AppUser>(COL).updateOne(
    { email },
    { $set: { blocked: false } }
  );
  if (result.matchedCount === 0) {
    return { ok: false, message: `User ${email} not found` };
  }
  return { ok: true, message: `${email} unblocked` };
}
