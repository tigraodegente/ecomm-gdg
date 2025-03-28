/**
 * Adaptador de autenticação para Cloudflare
 * 
 * Este adaptador implementa um sistema de autenticação compatível com Cloudflare
 * usando Turso DB e Cloudflare KV Storage para armazenamento de sessões.
 */

import { executeQuery } from '../../db/turso-client';
import crypto from 'crypto';
import * as jose from 'jose';

// Tipos básicos
export interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
  emailVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  createdAt: string;
}

export interface Verification {
  id: string;
  userId?: string;
  token: string;
  identifier: string;
  expires: string;
  createdAt: string;
}

interface PasswordReset {
  id: string;
  email: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

// Configuração do adaptador
export interface CloudflareAdapterConfig {
  secret: string;
  cookieName?: string;
  sessionExpiry?: number; // em segundos
  jwtExpiry?: number; // em segundos
  kvNamespace?: string; // Namespace KV do Cloudflare para armazenar sessões
}

// Funções auxiliares
function generateId(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

function hashPassword(password: string): string {
  // Em produção, seria recomendado usar argon2 ou bcrypt, mas para compatibilidade com Cloudflare
  // estamos usando um método baseado em PBKDF2 que é nativo do Node.js
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(storedPassword: string, suppliedPassword: string): boolean {
  const [salt, hash] = storedPassword.split(':');
  const suppliedHash = crypto.pbkdf2Sync(suppliedPassword, salt, 1000, 64, 'sha512').toString('hex');
  return hash === suppliedHash;
}

// Classe principal do adaptador
export class CloudflareAdapter {
  private config: CloudflareAdapterConfig;
  
  constructor(config: CloudflareAdapterConfig) {
    this.config = {
      cookieName: 'auth_session',
      sessionExpiry: 30 * 24 * 60 * 60, // 30 dias em segundos
      jwtExpiry: 1 * 24 * 60 * 60, // 1 dia em segundos
      ...config
    };
  }

  // Funções de gerenciamento de usuários
  async createUser({ email, password, name, image }: { email: string; password: string; name?: string; image?: string }): Promise<User> {
    try {
      // Verificar se o usuário já existe
      const existingUser = await this.getUserByEmail(email);
      if (existingUser) {
        throw new Error('User already exists');
      }

      const id = generateId();
      const hashedPassword = hashPassword(password);
      const now = new Date().toISOString();

      // Criar usuário no banco de dados
      await executeQuery(
        `INSERT INTO User (id, email, name, image, emailVerified, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, email, name || null, image || null, false, now, now]
      );

      // Criar credencial no banco de dados
      await executeQuery(
        `INSERT INTO Credential (userId, type, value, createdAt) 
         VALUES (?, ?, ?, ?)`,
        [id, 'password', hashedPassword, now]
      );

      return {
        id,
        email,
        name,
        image,
        emailVerified: false,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const result = await executeQuery<any>(
        `SELECT * FROM User WHERE email = ? LIMIT 1`,
        [email]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0] as User;
      }
      return null;
    } catch (error) {
      console.error('Error getting user by email:', error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      const result = await executeQuery<any>(
        `SELECT * FROM User WHERE id = ? LIMIT 1`,
        [id]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0] as User;
      }
      return null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      throw error;
    }
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    try {
      const updates = Object.entries(data)
        .filter(([key]) => key !== 'id' && key !== 'createdAt')
        .map(([key, _]) => `${key} = ?`);
      
      const values = Object.entries(data)
        .filter(([key]) => key !== 'id' && key !== 'createdAt')
        .map(([_, value]) => value);
      
      if (updates.length === 0) {
        throw new Error('No valid fields to update');
      }

      const now = new Date().toISOString();
      updates.push('updatedAt = ?');
      values.push(now);
      values.push(id); // for the WHERE clause

      await executeQuery(
        `UPDATE User SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      return await this.getUserById(id) as User;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      // Primeiro excluir registros relacionados
      await executeQuery(`DELETE FROM Session WHERE userId = ?`, [id]);
      await executeQuery(`DELETE FROM Account WHERE userId = ?`, [id]);
      await executeQuery(`DELETE FROM Credential WHERE userId = ?`, [id]);
      
      // Depois excluir o usuário
      const result = await executeQuery<any>(
        `DELETE FROM User WHERE id = ?`,
        [id]
      );

      return result.rowsAffected > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  // Funções de autenticação
  async signInWithPassword(email: string, password: string): Promise<{ user: User; session: Session } | null> {
    try {
      // Buscar usuário
      const user = await this.getUserByEmail(email);
      if (!user) {
        return null;
      }

      // Buscar credencial
      const credResult = await executeQuery<any>(
        `SELECT value FROM Credential WHERE userId = ? AND type = 'password' LIMIT 1`,
        [user.id]
      );

      if (!credResult.rows || credResult.rows.length === 0) {
        return null;
      }

      const storedPassword = credResult.rows[0].value;
      if (!verifyPassword(storedPassword, password)) {
        return null;
      }

      // Criar nova sessão
      const session = await this.createSession(user.id);
      
      return { user, session };
    } catch (error) {
      console.error('Error signing in with password:', error);
      throw error;
    }
  }

  async createSession(userId: string): Promise<Session> {
    try {
      const id = generateId();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + this.config.sessionExpiry! * 1000).toISOString();

      await executeQuery(
        `INSERT INTO Session (id, userId, expiresAt, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?)`,
        [id, userId, expiresAt, now, now]
      );

      return {
        id,
        userId,
        expiresAt,
        createdAt: now,
        updatedAt: now
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async getSessionById(id: string): Promise<Session | null> {
    try {
      const result = await executeQuery<any>(
        `SELECT * FROM Session WHERE id = ? AND expiresAt > datetime('now') LIMIT 1`,
        [id]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0] as Session;
      }
      return null;
    } catch (error) {
      console.error('Error getting session:', error);
      throw error;
    }
  }

  async deleteSession(id: string): Promise<boolean> {
    try {
      const result = await executeQuery<any>(
        `DELETE FROM Session WHERE id = ?`,
        [id]
      );

      return result.rowsAffected > 0;
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }

  async deleteSessions(userId: string): Promise<boolean> {
    try {
      const result = await executeQuery<any>(
        `DELETE FROM Session WHERE userId = ?`,
        [userId]
      );

      return result.rowsAffected > 0;
    } catch (error) {
      console.error('Error deleting sessions:', error);
      throw error;
    }
  }

  // Funções JWT para compatibilidade com Cloudflare
  async createJWT(payload: any): Promise<string> {
    const secretKey = new TextEncoder().encode(this.config.secret);
    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(this.config.jwtExpiry ? `${this.config.jwtExpiry}s` : '1d')
      .sign(secretKey);
    
    return jwt;
  }

  async verifyJWT(token: string): Promise<any> {
    try {
      const secretKey = new TextEncoder().encode(this.config.secret);
      const { payload } = await jose.jwtVerify(token, secretKey);
      return payload;
    } catch (error) {
      console.error('Error verifying JWT:', error);
      return null;
    }
  }

  // Funções para verificação de email
  async createVerification(userId: string, email: string): Promise<Verification> {
    try {
      const id = generateId();
      const token = generateId(32);
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 horas

      await executeQuery(
        `INSERT INTO Verification (id, userId, token, identifier, expires, createdAt) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId, token, email, expires, now]
      );

      return {
        id,
        userId,
        token,
        identifier: email,
        expires,
        createdAt: now
      };
    } catch (error) {
      console.error('Error creating verification:', error);
      throw error;
    }
  }

  async getVerification(token: string): Promise<Verification | null> {
    try {
      const result = await executeQuery<any>(
        `SELECT * FROM Verification WHERE token = ? AND expires > datetime('now') LIMIT 1`,
        [token]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0] as Verification;
      }
      return null;
    } catch (error) {
      console.error('Error getting verification:', error);
      throw error;
    }
  }

  async deleteVerification(id: string): Promise<boolean> {
    try {
      const result = await executeQuery<any>(
        `DELETE FROM Verification WHERE id = ?`,
        [id]
      );

      return result.rowsAffected > 0;
    } catch (error) {
      console.error('Error deleting verification:', error);
      throw error;
    }
  }

  async createPasswordReset(email: string): Promise<PasswordReset> {
    try {
      const id = generateId();
      const token = generateId(32);
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString(); // 1 hora

      await executeQuery(
        `INSERT INTO PasswordReset (id, email, token, expiresAt, createdAt) 
         VALUES (?, ?, ?, ?, ?)`,
        [id, email, token, expiresAt, now]
      );

      return {
        id,
        email,
        token,
        expiresAt,
        createdAt: now
      };
    } catch (error) {
      console.error('Error creating password reset:', error);
      throw error;
    }
  }

  async getPasswordReset(token: string): Promise<PasswordReset | null> {
    try {
      const result = await executeQuery<any>(
        `SELECT * FROM PasswordReset WHERE token = ? AND expiresAt > datetime('now') LIMIT 1`,
        [token]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0] as PasswordReset;
      }
      return null;
    } catch (error) {
      console.error('Error getting password reset:', error);
      throw error;
    }
  }

  async deletePasswordReset(id: string): Promise<boolean> {
    try {
      const result = await executeQuery<any>(
        `DELETE FROM PasswordReset WHERE id = ?`,
        [id]
      );

      return result.rowsAffected > 0;
    } catch (error) {
      console.error('Error deleting password reset:', error);
      throw error;
    }
  }

  // Funções para contas vinculadas (OAuth)
  async createAccount(data: Omit<Account, 'id' | 'createdAt'>): Promise<Account> {
    try {
      const id = generateId();
      const now = new Date().toISOString();

      await executeQuery(
        `INSERT INTO Account (id, userId, provider, providerAccountId, createdAt) 
         VALUES (?, ?, ?, ?, ?)`,
        [id, data.userId, data.provider, data.providerAccountId, now]
      );

      return {
        id,
        ...data,
        createdAt: now
      };
    } catch (error) {
      console.error('Error creating account:', error);
      throw error;
    }
  }

  async getAccountByProvider(provider: string, providerAccountId: string): Promise<Account | null> {
    try {
      const result = await executeQuery<any>(
        `SELECT * FROM Account WHERE provider = ? AND providerAccountId = ? LIMIT 1`,
        [provider, providerAccountId]
      );

      if (result.rows && result.rows.length > 0) {
        return result.rows[0] as Account;
      }
      return null;
    } catch (error) {
      console.error('Error getting account by provider:', error);
      throw error;
    }
  }

  async deleteAccount(id: string): Promise<boolean> {
    try {
      const result = await executeQuery<any>(
        `DELETE FROM Account WHERE id = ?`,
        [id]
      );

      return result.rowsAffected > 0;
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }
}