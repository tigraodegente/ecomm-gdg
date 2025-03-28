/**
 * Cliente de autenticação para o frontend
 * 
 * Esta implementação simula a API do better-auth/client para manter compatibilidade
 * com o código existente, mas é otimizado para funcionar com Cloudflare.
 */

interface AuthClient {
  baseURL: string;
  signIn: (data: { email: string; password: string }) => Promise<any>;
  signUp: (data: { email: string; password: string; name?: string; image?: string }) => Promise<any>;
  signOut: () => Promise<any>;
  getSession: () => Promise<any>;
  verifyEmail: (token: string) => Promise<any>;
  forgotPassword: (email: string) => Promise<any>;
  resetPassword: (data: { token: string; password: string }) => Promise<any>;
}

export function createAuthClient(options: { baseURL: string }): AuthClient {
  const baseURL = options.baseURL;

  // Função para fazer requisições à API
  async function fetchAPI(endpoint: string, method: string, data?: any) {
    try {
      const response = await fetch(`${baseURL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: data ? JSON.stringify(data) : undefined,
        credentials: 'include' // Importante para enviar cookies
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Falha na requisição');
      }
      
      return result;
    } catch (error) {
      console.error(`Erro ao chamar ${endpoint}:`, error);
      throw error;
    }
  }

  return {
    baseURL,
    
    // Login de usuário
    async signIn(data) {
      return fetchAPI('/api/auth/signin', 'POST', data);
    },
    
    // Registro de usuário
    async signUp(data) {
      return fetchAPI('/api/auth/signup', 'POST', data);
    },
    
    // Logout de usuário
    async signOut() {
      return fetchAPI('/api/auth/signout', 'POST');
    },
    
    // Obter sessão atual
    async getSession() {
      return fetchAPI('/api/auth/session', 'GET');
    },
    
    // Verificar email
    async verifyEmail(token) {
      return fetchAPI(`/api/auth/verify-email?token=${token}`, 'GET');
    },
    
    // Solicitar recuperação de senha
    async forgotPassword(email) {
      return fetchAPI('/api/auth/forgot-password', 'POST', { email });
    },
    
    // Redefinir senha
    async resetPassword(data) {
      return fetchAPI('/api/auth/reset-password', 'POST', data);
    }
  };
}

// Criar cliente de autenticação padrão
export const client = createAuthClient({
  baseURL: import.meta.env.BETTER_AUTH_URL || ''
});