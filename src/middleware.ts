import { defineMiddleware } from "astro:middleware";

// Sistema de autenticação simplificado
export const onRequest = defineMiddleware(async (context, next) => {
  // Log discreto para debugging
  console.log(`[middleware] ${context.request.method} ${new URL(context.request.url).pathname}`);
  
  // Usar uma função simples que não depende de bibliotecas externas
  const user = await getUserFromRequest(context.request);

  // Configurar o contexto da requisição
  if (user) {
    context.locals.user = user;
    context.locals.session = { id: 'dummy-session-id' };
    console.log("[middleware] Usuário autenticado:", user.email);
  } else {
    context.locals.user = null;
    context.locals.session = null;
  }

  // Continuar com a próxima etapa
  return next();
});

// Função simplificada para obter usuário do cookie
async function getUserFromRequest(request: Request): Promise<any | null> {
  try {
    // Em um ambiente real, você verificaria o cookie e buscaria o usuário
    // Para simplificar, retornamos null (não autenticado)
    return null;
  } catch (error) {
    console.error("Erro ao obter usuário:", error);
    return null;
  }
}