import { executeQuery } from '../db/turso-client';
import { z } from 'zod';

// ActionError para compatibilidade com Cloudflare
type ActionErrorCode = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR';

class ActionError extends Error {
  code: ActionErrorCode;
  
  constructor({ code, message }: { code: ActionErrorCode; message: string }) {
    super(message);
    this.code = code;
    this.name = 'ActionError';
  }
}

// Função de purge de cache para Cloudflare
async function purgeCloudflareCache(tags: string[]) {
  try {
    console.log(`Purging cache for tags: ${tags.join(', ')}`);
    // Em ambiente de produção, implementar a chamada para a API de purge do Cloudflare
    // Exemplo: await fetch('https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache', {...})
  } catch (error) {
    console.error('Error purging Cloudflare cache:', error);
  }
}

export const posts = {
  // Create post
  async create(formData: FormData) {
    // Schema de validação
    const schema = z.object({
      title: z.string(),
      pubDate: z.string().transform((str) => new Date(str)),
      description: z.string(),
      author: z.string(),
      imageUrl: z.string().nullable(),
      imageAlt: z.string().nullable(),
      tags: z
        .string()
        .transform((str) => JSON.parse(str))
        .nullable(),
      slug: z.string(),
      content: z.string()
    });
    
    try {
      // Extrair e validar dados
      const data: Record<string, any> = {};
      for (const [key, value] of formData.entries()) {
        data[key] = value;
      }
      
      const input = schema.parse(data);
      
      // Inserir no banco de dados usando Turso
      const result = await executeQuery(
        `INSERT INTO Posts (title, pubDate, description, author, imageUrl, imageAlt, tags, slug, content) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        [
          input.title,
          input.pubDate.toISOString(),
          input.description,
          input.author,
          input.imageUrl,
          input.imageAlt,
          JSON.stringify(input.tags),
          input.slug,
          input.content
        ]
      );
      
      const post = result.rows?.[0];
      
      // Purgar cache no Cloudflare em produção
      if (import.meta.env.PROD) {
        await purgeCloudflareCache(['posts']);
      }
      
      return {
        success: true,
        post
      };
    } catch (error) {
      console.error('Error creating post:', error);
      if (error instanceof z.ZodError) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid input data'
        });
      }
      throw new ActionError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error creating post'
      });
    }
  },
  
  // Read post
  async get(slug: string) {
    try {
      const result = await executeQuery(
        `SELECT * FROM Posts WHERE slug = ? LIMIT 1`,
        [slug]
      );
      
      const post = result.rows?.[0];
      
      if (!post) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Post not found'
        });
      }
      
      return {
        success: true,
        post
      };
    } catch (error) {
      console.error('Error getting post:', error);
      if (error instanceof ActionError) {
        throw error;
      }
      throw new ActionError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error getting post'
      });
    }
  },
  
  // Update post
  async update(formData: FormData) {
    // Schema de validação
    const schema = z.object({
      id: z.coerce.number(),
      title: z.string().optional(),
      pubDate: z
        .string()
        .transform((str) => new Date(str))
        .optional(),
      description: z.string().optional(),
      author: z.string().optional(),
      imageUrl: z.string().nullable().optional(),
      imageAlt: z.string().nullable().optional(),
      tags: z
        .string()
        .transform((str) => JSON.parse(str))
        .nullable()
        .optional(),
      slug: z.string().optional(),
      content: z.string().optional()
    });
    
    try {
      // Extrair e validar dados
      const data: Record<string, any> = {};
      for (const [key, value] of formData.entries()) {
        data[key] = value;
      }
      
      const input = schema.parse(data);
      
      // Construir query de atualização dinamicamente
      const fields: string[] = [];
      const values: any[] = [];
      
      Object.entries(input).forEach(([key, value]) => {
        if (key !== 'id' && value !== undefined) {
          fields.push(`${key} = ?`);
          if (key === 'pubDate' && value instanceof Date) {
            values.push(value.toISOString());
          } else if (key === 'tags' && value !== null) {
            values.push(JSON.stringify(value));
          } else {
            values.push(value);
          }
        }
      });
      
      // Adicionar id para a cláusula WHERE
      values.push(input.id);
      
      // Executar query de atualização
      const result = await executeQuery(
        `UPDATE Posts SET ${fields.join(', ')} WHERE id = ? RETURNING *`,
        values
      );
      
      const post = result.rows?.[0];
      
      if (!post) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Post not found'
        });
      }
      
      // Purgar cache no Cloudflare em produção
      if (import.meta.env.PROD) {
        await purgeCloudflareCache([`post-${post.slug}`]);
      }
      
      return {
        success: true,
        post
      };
    } catch (error) {
      console.error('Error updating post:', error);
      if (error instanceof z.ZodError) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid input data'
        });
      }
      throw new ActionError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error updating post'
      });
    }
  },
  
  // Delete post
  async delete(formData: FormData) {
    // Schema de validação
    const schema = z.object({
      id: z.coerce.number()
    });
    
    try {
      // Extrair e validar dados
      const data: Record<string, any> = {};
      for (const [key, value] of formData.entries()) {
        data[key] = value;
      }
      
      const input = schema.parse(data);
      
      // Obter o slug antes de deletar (para purgar o cache)
      const getResult = await executeQuery(
        `SELECT slug FROM Posts WHERE id = ? LIMIT 1`,
        [input.id]
      );
      
      const post = getResult.rows?.[0];
      
      if (!post) {
        throw new ActionError({
          code: 'NOT_FOUND',
          message: 'Post not found'
        });
      }
      
      // Executar a exclusão
      await executeQuery(
        `DELETE FROM Posts WHERE id = ?`,
        [input.id]
      );
      
      // Purgar cache no Cloudflare em produção
      if (import.meta.env.PROD) {
        await purgeCloudflareCache(['posts', `post-${post.slug}`]);
      }
      
      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting post:', error);
      if (error instanceof z.ZodError) {
        throw new ActionError({
          code: 'BAD_REQUEST',
          message: 'Invalid input data'
        });
      }
      if (error instanceof ActionError) {
        throw error;
      }
      throw new ActionError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error deleting post'
      });
    }
  }
};