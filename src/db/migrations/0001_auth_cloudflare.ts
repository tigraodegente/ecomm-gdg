import { sql } from 'drizzle-orm';

export const createCredentialTable = sql`
CREATE TABLE IF NOT EXISTS Credential (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
);
`;

export const createPasswordResetTable = sql`
CREATE TABLE IF NOT EXISTS PasswordReset (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
`;

export const createIndexes = sql`
CREATE INDEX IF NOT EXISTS credential_user_idx ON Credential(userId);
CREATE INDEX IF NOT EXISTS credential_type_idx ON Credential(type);
CREATE INDEX IF NOT EXISTS password_reset_token_idx ON PasswordReset(token);
CREATE INDEX IF NOT EXISTS password_reset_email_idx ON PasswordReset(email);
`;

export default async function(client) {
  console.log('Running migration: 0001_auth_cloudflare.ts');
  
  // Execute migrations
  await client.execute(createCredentialTable);
  await client.execute(createPasswordResetTable);
  await client.execute(createIndexes);
  
  console.log('Migration complete: 0001_auth_cloudflare.ts');
  return { success: true };
}