import { auth } from '@/lib/auth';
import type { APIRoute } from "astro";

// APIs de autenticação compatíveis com Cloudflare Workers
export const ALL: APIRoute = async ({ request, params }) => {
  const endpoint = params.all || '';
  const url = new URL(request.url);
  
  try {
    // Roteador de endpoints de autenticação
    switch (endpoint) {
      case 'signin':
        if (request.method === 'POST') {
          const body = await request.json();
          return await auth.api.signInEmail({
            body,
            headers: request.headers,
            asResponse: true
          });
        }
        break;
        
      case 'signup':
        if (request.method === 'POST') {
          const body = await request.json();
          return await auth.api.signUpEmail({
            body,
            headers: request.headers,
            asResponse: true
          });
        }
        break;
        
      case 'signout':
        if (request.method === 'POST') {
          return await auth.api.signOut({
            headers: request.headers,
            asResponse: true
          });
        }
        break;
        
      case 'session':
        if (request.method === 'GET') {
          const session = await auth.session(request);
          return new Response(JSON.stringify(session || { user: null, session: null }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          });
        }
        break;
        
      case 'verify-email':
        if (request.method === 'GET') {
          const token = url.searchParams.get('token');
          if (!token) {
            return new Response(JSON.stringify({ error: 'Token not provided' }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json'
              }
            });
          }
          
          const result = await auth.api.verifyEmail(token);
          return new Response(JSON.stringify({ success: result }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          });
        }
        break;
        
      case 'forgot-password':
        if (request.method === 'POST') {
          const body = await request.json();
          const result = await auth.api.forgotPassword(body.email);
          return new Response(JSON.stringify({ success: result }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          });
        }
        break;
        
      case 'reset-password':
        if (request.method === 'POST') {
          const body = await request.json();
          const result = await auth.api.resetPassword(body.token, body.password);
          return new Response(JSON.stringify({ success: result }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            }
          });
        }
        break;
      
      default:
        return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json'
          }
        });
    }
    
    // Método não suportado
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
};