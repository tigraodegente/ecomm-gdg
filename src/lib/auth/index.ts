/**
 * Sistema de autenticação personalizado compatível com Cloudflare
 * 
 * Esta implementação simula a API do better-auth para manter compatibilidade
 * com o código existente, mas utiliza o CloudflareAdapter para funcionar no
 * ambiente Cloudflare com Turso DB e KV Storage.
 */

import { CloudflareAdapter, type User, type Session } from './cloudflare-adapter';
import { sendEmail } from '../email';

// Tipos de requisições para API de autenticação
interface APIRequestOptions {
  headers: Headers;
  body?: any;
  asResponse?: boolean;
}

interface SignUpEmailOptions extends APIRequestOptions {
  body: {
    email: string;
    password: string;
    name?: string;
    image?: string;
  };
}

interface SignInEmailOptions extends APIRequestOptions {
  body: {
    email: string;
    password: string;
  };
}

// Criação da instância do adaptador
let adapter: CloudflareAdapter | null = null;

export function createAuth(options: {
  baseURL: string;
  secret: string;
  account?: {
    accountLinking?: {
      enabled?: boolean;
    };
  };
  database?: any;
  emailVerification?: {
    sendOnSignUp?: boolean;
    sendVerificationEmail?: (data: { user: User; url: string; token: string }, request: Request) => Promise<void>;
  };
  emailAndPassword?: {
    enabled?: boolean;
  };
  session?: {
    cookieCache?: {
      enabled?: boolean;
      maxAge?: number;
    };
  };
}) {
  if (!adapter) {
    adapter = new CloudflareAdapter({
      secret: options.secret,
      sessionExpiry: options.session?.cookieCache?.maxAge ? options.session.cookieCache.maxAge * 1000 : undefined,
    });
  }

  // API pública compatível com a API do better-auth
  return {
    adapter,
    
    // API para operações de autenticação
    api: {
      // Registro de usuário
      async signUpEmail(options: SignUpEmailOptions) {
        try {
          const { email, password, name, image } = options.body;

          // Verificar se o usuário já existe
          const existingUser = await adapter.getUserByEmail(email);
          if (existingUser) {
            return createErrorResponse("User already exists", 400, options.asResponse);
          }

          // Criar novo usuário
          const user = await adapter.createUser({ email, password, name, image });

          // Enviar email de verificação se necessário
          if (options.emailVerification?.sendOnSignUp) {
            const verification = await adapter.createVerification(user.id, email);
            const verificationUrl = `${options.baseURL}/verify-email?token=${verification.token}`;
            
            if (options.emailVerification.sendVerificationEmail) {
              await options.emailVerification.sendVerificationEmail(
                { user, url: verificationUrl, token: verification.token },
                new Request(options.baseURL)
              );
            }
          }

          // Criar uma sessão para o usuário
          const session = await adapter.createSession(user.id);
          
          // Retornar resposta com cookies
          return createSuccessResponse({ user, session }, options.asResponse);
        } catch (error) {
          console.error("Error in signUpEmail:", error);
          return createErrorResponse("Failed to create user", 500, options.asResponse);
        }
      },

      // Login de usuário
      async signInEmail(options: SignInEmailOptions) {
        try {
          const { email, password } = options.body;
          
          // Fazer login
          const result = await adapter.signInWithPassword(email, password);
          if (!result) {
            return createErrorResponse("Invalid email or password", 401, options.asResponse);
          }
          
          // Retornar resposta com cookies
          return createSuccessResponse(result, options.asResponse);
        } catch (error) {
          console.error("Error in signInEmail:", error);
          return createErrorResponse("Authentication failed", 500, options.asResponse);
        }
      },

      // Logout
      async signOut(options: APIRequestOptions) {
        try {
          const sessionCookie = getSessionFromCookie(options.headers);
          if (sessionCookie) {
            await adapter.deleteSession(sessionCookie);
          }
          
          // Retornar resposta com cookies vazios para limpar
          return createSignOutResponse(options.asResponse);
        } catch (error) {
          console.error("Error in signOut:", error);
          return createErrorResponse("Failed to sign out", 500, options.asResponse);
        }
      },

      // Verificação de e-mail
      async verifyEmail(token: string) {
        try {
          const verification = await adapter.getVerification(token);
          if (!verification) {
            throw new Error("Invalid or expired verification token");
          }
          
          if (verification.userId) {
            // Atualizar usuário para verificado
            await adapter.updateUser(verification.userId, { emailVerified: true });
            
            // Remover verificação
            await adapter.deleteVerification(verification.id);
            
            return true;
          }
          
          return false;
        } catch (error) {
          console.error("Error in verifyEmail:", error);
          throw error;
        }
      },

      // Recuperação de senha
      async forgotPassword(email: string) {
        try {
          const user = await adapter.getUserByEmail(email);
          if (user) {
            // Criar token de reset
            const reset = await adapter.createPasswordReset(email);
            
            // Aqui você implementaria o envio de e-mail com o token
            // similar ao que você já tem no sendVerificationEmail
            
            return true;
          }
          return false;
        } catch (error) {
          console.error("Error in forgotPassword:", error);
          throw error;
        }
      },

      // Reset de senha
      async resetPassword(token: string, newPassword: string) {
        try {
          const reset = await adapter.getPasswordReset(token);
          if (!reset) {
            throw new Error("Invalid or expired reset token");
          }
          
          const user = await adapter.getUserByEmail(reset.email);
          if (!user) {
            throw new Error("User not found");
          }
          
          // Atualizar credencial (implementar essa função no adaptador)
          // await adapter.updateCredential(user.id, 'password', newPassword);
          
          // Remover reset
          await adapter.deletePasswordReset(reset.id);
          
          return true;
        } catch (error) {
          console.error("Error in resetPassword:", error);
          throw error;
        }
      }
    },
    
    // Middleware para verificar e gerenciar sessões
    async session(request: Request) {
      try {
        // Extrair cookie de sessão
        const sessionId = getSessionFromCookie(request.headers);
        if (!sessionId) {
          return null;
        }
        
        // Verificar sessão no banco de dados
        const session = await adapter.getSessionById(sessionId);
        if (!session) {
          return null;
        }
        
        // Obter dados do usuário
        const user = await adapter.getUserById(session.userId);
        if (!user) {
          return null;
        }
        
        return { session, user };
      } catch (error) {
        console.error("Error in session middleware:", error);
        return null;
      }
    }
  };
}

// Função para criar autenticação compatível com better-auth
export function betterAuth(options: any) {
  return createAuth(options);
}

// Funções auxiliares
function getSessionFromCookie(headers: Headers): string | null {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  // Parse cookies manualmente
  const cookiePairs = cookieHeader.split(';');
  for (const cookiePair of cookiePairs) {
    const [name, value] = cookiePair.trim().split('=');
    if (name === 'auth_session') {
      return decodeURIComponent(value);
    }
  }
  
  return null;
}

function createSuccessResponse(data: any, asResponse = false) {
  const session = data.session;
  const cookieValue = `auth_session=${session.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`;
  
  if (asResponse) {
    const headers = new Headers();
    headers.append('Set-Cookie', cookieValue);
    
    return new Response(JSON.stringify({ success: true, user: data.user }), {
      status: 200,
      headers
    });
  }
  
  return {
    success: true,
    user: data.user,
    session: data.session,
    headers: {
      'Set-Cookie': cookieValue
    }
  };
}

function createSignOutResponse(asResponse = false) {
  const cookieValue = `auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  
  if (asResponse) {
    const headers = new Headers();
    headers.append('Set-Cookie', cookieValue);
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers
    });
  }
  
  return {
    success: true,
    headers: {
      'Set-Cookie': cookieValue
    }
  };
}

function createErrorResponse(message: string, status: number, asResponse = false) {
  if (asResponse) {
    return new Response(JSON.stringify({ error: message }), {
      status
    });
  }
  
  return {
    success: false,
    error: message,
    status
  };
}

// Exportar tipos para uso em outros arquivos
export type { User, Session };