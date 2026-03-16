import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query(sql, params);
  return result.rowCount ?? 0;
}

export const PREDEFINED_USERS = [
  { id: "user_1",  username: "alice_chen",    displayName: "Alice Chen" },
  { id: "user_2",  username: "bob_martinez",  displayName: "Bob Martinez" },
  { id: "user_3",  username: "carol_smith",   displayName: "Carol Smith" },
  { id: "user_4",  username: "david_kim",     displayName: "David Kim" },
  { id: "user_5",  username: "emma_wilson",   displayName: "Emma Wilson" },
  { id: "user_6",  username: "frank_johnson", displayName: "Frank Johnson" },
  { id: "user_7",  username: "grace_liu",     displayName: "Grace Liu" },
  { id: "user_8",  username: "henry_brown",   displayName: "Henry Brown" },
  { id: "user_9",  username: "iris_patel",    displayName: "Iris Patel" },
  { id: "user_10", username: "james_taylor",  displayName: "James Taylor" },
];
