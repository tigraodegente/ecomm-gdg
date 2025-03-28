// Sistema de autenticação simplificado para Cloudflare
import { CloudflareAuth, type User, type Session } from './auth/cloudflare-auth';
import { sendEmail } from './email';

// Configurar o sistema de autenticação
const authInstance = new CloudflareAuth({
  secret: import.meta.env.BETTER_AUTH_SECRET || 'default-secret-key-change-me',
  cookieName: 'auth_session',
  sessionDuration: 30 // 30 dias
});

// API para compatibilidade com código existente
const authAPI = {
  api: {
    signInEmail: async ({ body, headers, asResponse }) => {
      const result = await authInstance.handleSignIn(body.email, body.password);
      
      if (asResponse && result instanceof Response) {
        return result;
      }
      
      return result;
    },
    
    signUpEmail: async ({ body, headers, asResponse }) => {
      const result = await authInstance.handleSignUp({
        email: body.email,
        password: body.password,
        name: body.name,
        image: body.image || ''
      });
      
      if (asResponse && result instanceof Response) {
        return result;
      }
      
      // Enviar email de verificação se necessário
      if (import.meta.env.BETTER_AUTH_EMAIL_VERIFICATION === "true" && result.success) {
        try {
          const user = await authInstance.getUserByEmail(body.email);
          if (user) {
            // Criar link de verificação
            const token = generateVerificationToken(user.id);
            const url = `${import.meta.env.BETTER_AUTH_URL}/verify-email?token=${token}`;
            
            await sendEmail({
              to: user.email,
              subject: "Verify your email address",
              html: `<a href="${url}">Click the link to verify your email</a>`
            });
          }
        } catch (error) {
          console.error('Error sending verification email:', error);
        }
      }
      
      return result;
    },
    
    signOut: async ({ headers, asResponse }) => {
      const result = await authInstance.handleSignOut();
      
      if (asResponse && result instanceof Response) {
        return result;
      }
      
      return result;
    },
    
    getSession: async (headers) => {
      // Obter sessão do cookie
      const request = new Request('https://example.com', { headers });
      return authInstance.getSession(request);
    },
    
    verifyEmail: async (token) => {
      // Implementar verificação de email
      console.log('Verificando email com token:', token);
      return true;
    }
  },
  
  // Middleware para Astro
  session: (request) => {
    return authInstance.getSession(request);
  }
};

// Função auxiliar para gerar tokens de verificação
function generateVerificationToken(userId: string): string {
  // Em um ambiente real, salvar isto no banco de dados
  return `verify_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// Exportar como 'auth' para compatibilidade com código existente
export const auth = authAPI;

// Exportar tipos
export type { User, Session };