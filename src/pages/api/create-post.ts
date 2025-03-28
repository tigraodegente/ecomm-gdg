import { executeQuery } from '../../db/turso-client';
import type { APIContext } from "astro";

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

export async function POST(context: APIContext): Promise<Response> {
  try {
    const formData = await context.request.formData();

    const post = {
      title: formData.get("title") as string,
      pubDate: new Date(formData.get("pubDate") as string),
      description: formData.get("description") as string,
      author: formData.get("author") as string,
      imageUrl: formData.get("imageUrl") as string | null,
      imageAlt: formData.get("imageAlt") as string | null,
      tags: formData.get("tags") ? JSON.parse(formData.get("tags") as string) : null,
      slug: formData.get("slug") as string,
      content: formData.get("content") as string
    };

    // Validate required fields
    if (!post.title || !post.pubDate || !post.description || !post.author || !post.slug || !post.content) {
      return new Response("Missing required fields", { status: 400 });
    }

    // Inserir no banco de dados usando Turso
    await executeQuery(
      `INSERT INTO Posts (title, pubDate, description, author, imageUrl, imageAlt, tags, slug, content) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        post.title,
        post.pubDate.toISOString(),
        post.description,
        post.author,
        post.imageUrl,
        post.imageAlt,
        JSON.stringify(post.tags),
        post.slug,
        post.content
      ]
    );

    // Purgar cache no Cloudflare em produção
    if (import.meta.env.PROD) {
      await purgeCloudflareCache(['posts']);
    }

    return context.redirect("/posts");
  } catch (error) {
    console.error("Error creating post:", error);
    return new Response("Error creating post", { status: 500 });
  }
}