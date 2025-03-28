import { defineMiddleware } from "astro:middleware";

// Sistema de autenticação simplificado
export const onRequest = defineMiddleware(async (context, next) => {
  console.log("Middleware executando");

  // SOLUÇÃO TEMPORÁRIA PARA O SLUG "cadeira-de-alimentacao-multifuncional"
  // Verificar se a URL corresponde ao produto específico
  const url = new URL(context.request.url);
  if (url.pathname === '/produto/cadeira-de-alimentacao-multifuncional') {
    console.log("🚨 MIDDLEWARE: Detecção de acesso ao slug problemático");
    
    // Adicionamos um sinalizador à requisição para usar em [slug].astro
    context.locals.specialProductSlug = {
      slug: 'cadeira-de-alimentacao-multifuncional',
      useDirectData: true
    };
    
    console.log("🚨 MIDDLEWARE: Adicionado sinalizador para uso de dados estáticos diretamente");
  }
  
  // Usar uma função simples que não depende de bibliotecas externas
  const user = await getUserFromRequest(context.request);

  // Configurar o contexto da requisição
  if (user) {
    context.locals.user = user;
    context.locals.session = { id: 'dummy-session-id' };
    console.log("Usuário autenticado:", user.email);
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