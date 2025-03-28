// Versão adaptada para Cloudflare
import type { AstroCookies } from "astro";
import { auth } from "@/lib/auth";
import { z } from 'zod';

function parseCookiesFromResponse(cookiesArray: string[]) {
  return cookiesArray.map((cookieString) => {
    const [nameValue, ...options] = cookieString.split(";").map((s) => s.trim());
    const [name, value] = nameValue.split("=");

    const cookieOptions = Object.fromEntries(
      options.map((opt) => {
        const [key, val] = opt.split("=");
        return [key.toLowerCase(), val ?? true];
      })
    );

    return { name, value: decodeURIComponent(value), options: cookieOptions };
  });
}

export function setAuthCookiesFromResponse(cookiesArray: string[], cookies: AstroCookies) {
  const cookiesToSet = parseCookiesFromResponse(cookiesArray);
  for (const cookie of cookiesToSet) {
    cookies.set(cookie.name, cookie.value, cookie.options);
  }
}

type ActionErrorCode = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR';

class ActionError extends Error {
  code: ActionErrorCode;
  
  constructor({ code, message }: { code: ActionErrorCode; message: string }) {
    super(message);
    this.code = code;
    this.name = 'ActionError';
  }
}

async function handleAuthResponse(
  apiCall: () => Promise<Response>,
  context: { request: Request },
  errorCode: ActionErrorCode
) {
  try {
    const response = await apiCall();
    if (!response.ok) {
      throw new Error(`Failed to ${errorCode.toLowerCase()}`);
    }

    return { success: true, cookiesToSet: response.headers.getSetCookie() };
  } catch (error) {
    throwActionAuthError(errorCode, error);
  }
}

// Simplificação de defineAction para compatibilidade com Cloudflare
function defineAction(options: {
  accept?: string;
  input?: z.ZodType<any, any>;
  handler: (input: any, context: { request: Request }) => Promise<any>;
}) {
  return async (formData: FormData, request: Request) => {
    let input: any;
    
    if (options.input) {
      try {
        // Converter FormData para objeto
        const data: Record<string, any> = {};
        for (const [key, value] of formData.entries()) {
          data[key] = value;
        }
        
        // Validar com Zod
        input = options.input.parse(data);
      } catch (error) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid input data'
        });
      }
    } else {
      input = undefined;
    }
    
    return options.handler(input, { request });
  };
}

export const cloudflareAuth = {
  signUp: async (formData: FormData, request: Request) => {
    // Schema de validação
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
      name: z.string(),
      imageUrl: z.string().optional(),
      middleware: z.string().optional()
    });
    
    // Extrair e validar dados
    const data: Record<string, any> = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    try {
      const input = schema.parse(data);
      
      if (input.middleware) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Bots are not allowed to sign up"
        });
      }
      
      return await handleAuthResponse(
        () =>
          auth.api.signUpEmail({
            body: { ...input, image: input.imageUrl || "" },
            headers: request.headers,
            asResponse: true
          }),
        { request },
        "BAD_REQUEST"
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Invalid input data"
        });
      }
      throw error;
    }
  },
  
  signIn: async (formData: FormData, request: Request) => {
    // Schema de validação
    const schema = z.object({
      email: z.string().email(),
      password: z.string()
    });
    
    // Extrair e validar dados
    const data: Record<string, any> = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    
    try {
      const input = schema.parse(data);
      
      return await handleAuthResponse(
        () =>
          auth.api.signInEmail({
            body: input,
            headers: request.headers,
            asResponse: true
          }),
        { request },
        "UNAUTHORIZED"
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Invalid email or password"
        });
      }
      throw error;
    }
  },
  
  signOut: async (formData: FormData, request: Request) => {
    return await handleAuthResponse(
      () =>
        auth.api.signOut({
          headers: request.headers,
          asResponse: true
        }),
      { request },
      "BAD_REQUEST"
    );
  }
};

// Para compatibilidade com código existente
export const auth = cloudflareAuth;

function throwActionAuthError(code: ActionErrorCode, error: unknown): never {
  console.error(error);
  throw new ActionError({
    code,
    message: error instanceof Error ? error.message : "Something went wrong, please try again later."
  });
}