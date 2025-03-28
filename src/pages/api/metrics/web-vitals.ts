/**
 * API endpoint para receber e armazenar métricas de Web Vitals
 * 
 * Este endpoint recebe dados enviados pelo componente WebVitalsMonitor
 * e os armazena no Cloudflare KV para análise posterior.
 */

import type { APIRoute } from "astro";

export const post: APIRoute = async ({ request, locals, cookies }) => {
  try {
    // Verificar a requisição
    if (!request.body) {
      return new Response(JSON.stringify({ error: "No data provided" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Extrair dados da métrica
    const metric = await request.json();

    // Adicionar timestamp se não existir
    if (!metric.timestamp) {
      metric.timestamp = Date.now();
    }

    // Adicionar ID de usuário anônimo do cookie se disponível
    const userId = cookies.get("uid")?.value || null;
    if (userId) {
      metric.userId = userId;
    }

    // Adicionar informações da solicitação
    metric.ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
    metric.country = request.headers.get("cf-ipcountry") || "unknown";
    metric.userAgent = request.headers.get("user-agent") || "unknown";

    // Validar dados da métrica antes de salvar
    if (metric.type === "pageview" && !metric.url) {
      return new Response(JSON.stringify({ error: "Invalid pageview data" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Se estamos em um ambiente Cloudflare, armazenar no KV
    if (locals.runtime?.env?.PERFORMANCE_METRICS) {
      const kv = locals.runtime.env.PERFORMANCE_METRICS;
      
      // Criar chave única para a métrica
      const metricId = `${metric.sessionId || "anon"}_${metric.name || metric.type}_${Date.now()}`;
      
      // Armazenar a métrica no KV
      await kv.put(metricId, JSON.stringify(metric), {
        expirationTtl: 60 * 60 * 24 * 30, // 30 dias
        metadata: {
          type: metric.type || 'webvital',
          name: metric.name,
          timestamp: metric.timestamp,
          url: metric.url
        }
      });

      // Armazenar também em um cache para agregação
      if (metric.name) {
        // Agregação por hora para métricas Web Vitals
        const hourKey = `${metric.name}_${new Date().toISOString().substring(0, 13)}`;
        
        try {
          // Obter dados agregados existentes
          const existingData = await kv.get(hourKey, "json") || { 
            count: 0, 
            sum: 0, 
            min: Number.MAX_VALUE, 
            max: 0,
            values: []
          };
          
          // Atualizar dados agregados
          existingData.count += 1;
          existingData.sum += metric.value;
          existingData.min = Math.min(existingData.min, metric.value);
          existingData.max = Math.max(existingData.max, metric.value);
          
          // Manter apenas as últimas 1000 amostras para limitar o tamanho
          if (existingData.values.length < 1000) {
            existingData.values.push(metric.value);
          }
          
          // Salvar dados agregados
          await kv.put(hourKey, JSON.stringify(existingData), {
            expirationTtl: 60 * 60 * 24 * 7 // 7 dias
          });
        } catch (e) {
          console.error("Error updating aggregated metrics:", e);
        }
      }
    } else {
      // Em desenvolvimento, apenas registrar no console
      console.log("Web Vitals Metric:", metric);
    }

    // Retornar sucesso
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error processing Web Vitals metric:", error);
    
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
};