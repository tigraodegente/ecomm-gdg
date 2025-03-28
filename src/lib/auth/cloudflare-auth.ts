/**
 * Sistema de autenticação simples e compatível com Cloudflare
 */

import { executeQuery } from '../../db/turso-client';
import * as jose from 'jose';
import { createHash, randomBytes } from 'crypto';

// Interfaces para tipagem
export interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
  emailVerified?: boolean;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}

// Configuração
interface AuthConfig {
  secret: string;
  cookieName?: string;
  sessionDuration?: number; // duração em dias
}

// Funções auxiliares
function generateId(length = 16): string {
  return randomBytes(length).toString('hex');
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(storedPassword: string, suppliedPassword: string): boolean {
  const [salt, expectedHash] = storedPassword.split(':');
  const actualHash = createHash('sha256')
    .update(salt + suppliedPassword)
    .digest('hex');
  return expectedHash === actualHash;
}

// API principal
export class CloudflareAuth {
  private config: AuthConfig;
  private encodedSecret: Uint8Array;

  constructor(config: AuthConfig) {
    this.config = {
      cookieName: 'auth_session',
      sessionDuration: 30, // 30 dias por padrão
      ...config
    };
    this.encodedSecret = new TextEncoder().encode(config.secret);
  }

  // ---- Funções de usuário ----

  async createUser(data: { email: string; password: string; name?: string; image?: string }): Promise<User> {
    try {
      // Verificar se usuário já existe
      const existingUser = await this.getUserByEmail(data.email);
      if (existingUser) {
        throw new Error('User already exists');
      }

      const id = generateId();
      const now = new Date().toISOString();
      const hashedPassword = hashPassword(data.password);

      // Criar usuário
      await executeQuery(
        `INSERT INTO User (id, email, name, image, emailVerified, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, data.email, data.name || null, data.image || null, 0, now, now]
      );

      // Criar credencial
      await executeQuery(
        `INSERT INTO Credential (id, userId, type, value, createdAt) 
         VALUES (?, ?, ?, ?, ?)`,
        [generateId(), id, 'password', hashedPassword, now]
      );

      return {
        id,
        email: data.email,
        name: data.name,
        image: data.image,
        emailVerified: false
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
        const user = result.rows[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: Boolean(user.emailVerified)
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      const result = await executeQuery<any>(
        `SELECT * FROM User WHERE id = ? LIMIT 1`,
        [id]
      );

      if (result.rows && result.rows.length > 0) {
        const user = result.rows[0];
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: Boolean(user.emailVerified)
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  // ---- Funções de autenticação ----

  async signIn(email: string, password: string): Promise<{ user: User; session: Session } | null> {
    try {
      // Buscar usuário
      const user = await this.getUserByEmail(email);
      if (!user) {
        return null;
      }

      // Buscar credencial
      const result = await executeQuery<any>(
        `SELECT value FROM Credential WHERE userId = ? AND type = 'password' LIMIT 1`,
        [user.id]
      );

      if (!result.rows || result.rows.length === 0) {
        return null;
      }

      const storedPassword = result.rows[0].value;
      if (!verifyPassword(storedPassword, password)) {
        return null;
      }

      // Criar nova sessão
      const session = await this.createSession(user.id);
      
      return { user, session };
    } catch (error) {
      console.error('Error signing in:', error);
      return null;
    }
  }

  async createSession(userId: string): Promise<Session> {
    try {
      const id = generateId();
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(now.getDate() + this.config.sessionDuration!);

      await executeQuery(
        `INSERT INTO Session (id, userId, expiresAt, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?)`,
        [id, userId, expiresAt.toISOString(), now.toISOString(), now.toISOString()]
      );

      return {
        id,
        userId,
        expiresAt: expiresAt.toISOString()
      };
    } catch (error) {
      console.error('Error creating session:', error);
      throw error;
    }
  }

  async getSession(request: Request): Promise<{ user: User; session: Session } | null> {
    try {
      const sessionId = this.getSessionIdFromCookie(request.headers);
      if (!sessionId) {
        return null;
      }

      const session = await this.getSessionById(sessionId);
      if (!session) {
        return null;
      }

      const user = await this.getUserById(session.userId);
      if (!user) {
        return null;
      }

      return { user, session };
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  }

  async getSessionById(id: string): Promise<Session | null> {
    try {
      const result = await executeQuery<any>(
        `SELECT * FROM Session WHERE id = ? AND expiresAt > datetime('now') LIMIT 1`,
        [id]
      );

      if (result.rows && result.rows.length > 0) {
        const session = result.rows[0];
        return {
          id: session.id,
          userId: session.userId,
          expiresAt: session.expiresAt
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting session by ID:', error);
      return null;
    }
  }

  // ---- Funções de cookies ----

  getSessionIdFromCookie(headers: Headers): string | null {
    const cookieHeader = headers.get('cookie');
    if (!cookieHeader) {
      return null;
    }

    const cookieName = this.config.cookieName!;
    const regex = new RegExp(`(^|;)\\s*${cookieName}\\s*=\\s*([^;]+)`);
    const match = cookieHeader.match(regex);
    
    return match ? decodeURIComponent(match[2]) : null;
  }

  createSessionCookie(sessionId: string): string {
    const maxAge = this.config.sessionDuration! * 24 * 60 * 60; // Convertendo dias para segundos
    return `${this.config.cookieName}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  }

  createClearSessionCookie(): string {
    return `${this.config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  // ---- API para uso com Astro ----

  async handleSignIn(email: string, password: string): Promise<Response | { success: boolean; cookiesToSet: string[] }> {
    try {
      const result = await this.signIn(email, password);
      if (!result) {
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const sessionCookie = this.createSessionCookie(result.session.id);
      
      return {
        success: true,
        cookiesToSet: [sessionCookie]
      };
    } catch (error) {
      console.error('Error in handleSignIn:', error);
      return new Response(JSON.stringify({ error: 'Authentication failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleSignUp(data: { email: string; password: string; name?: string; image?: string }): 
    Promise<Response | { success: boolean; cookiesToSet: string[] }> {
    try {
      const user = await this.createUser(data);
      const session = await this.createSession(user.id);
      
      const sessionCookie = this.createSessionCookie(session.id);
      
      return {
        success: true,
        cookiesToSet: [sessionCookie]
      };
    } catch (error) {
      console.error('Error in handleSignUp:', error);
      
      const status = error.message === 'User already exists' ? 400 : 500;
      const message = error.message === 'User already exists' ? 
        'User already exists' : 'Failed to create user';
      
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  async handleSignOut(): Promise<Response | { success: boolean; cookiesToSet: string[] }> {
    const clearCookie = this.createClearSessionCookie();
    
    return {
      success: true,
      cookiesToSet: [clearCookie]
    };
  }
}