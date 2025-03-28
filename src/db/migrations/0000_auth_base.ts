import { sql } from 'drizzle-orm';

export const createUserTable = sql`
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  emailVerified INTEGER,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
`;

export const createSessionTable = sql`
CREATE TABLE IF NOT EXISTS Session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);
`;

export const createAccountTable = sql`
CREATE TABLE IF NOT EXISTS Account (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
  UNIQUE(provider, providerAccountId)
);
`;

export const createVerificationTable = sql`
CREATE TABLE IF NOT EXISTS Verification (
  id TEXT PRIMARY KEY,
  userId TEXT,
  token TEXT NOT NULL UNIQUE,
  identifier TEXT NOT NULL,
  expires TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);
`;

export const createIndexes = sql`
CREATE INDEX IF NOT EXISTS user_email_idx ON User(email);
CREATE INDEX IF NOT EXISTS session_user_idx ON Session(userId);
CREATE INDEX IF NOT EXISTS account_user_idx ON Account(userId);
CREATE INDEX IF NOT EXISTS verification_token_idx ON Verification(token);
`;

export default async function(client) {
  console.log('Running migration: 0000_auth_base.ts');
  
  // Execute migrations
  await client.execute(createUserTable);
  await client.execute(createSessionTable);
  await client.execute(createAccountTable);
  await client.execute(createVerificationTable);
  await client.execute(createIndexes);
  
  console.log('Migration complete: 0000_auth_base.ts');
  return { success: true };
}