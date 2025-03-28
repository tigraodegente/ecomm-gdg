/**
 * Worker para coleta e análise de métricas de performance
 * 
 * Este worker coleta Core Web Vitals e outras métricas de performance,
 * armazena no KV e fornece endpoints para visualização de dashboards.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Endpoint para receber métricas de performance
    if (url.pathname === '/api/performance' && request.method === 'POST') {
      return await handlePerformanceData(request, env, ctx);
    }
    
    // Endpoint para obter dados consolidados para dashboard
    if (url.pathname === '/api/analytics/dashboard' && request.method === 'GET') {
      return await getDashboardData(request, env, ctx);
    }
    
    // Endpoint para detalhes por página
    if (url.pathname === '/api/analytics/page' && request.method === 'GET') {
      return await getPageAnalytics(request, env, ctx);
    }
    
    // Endpoint não encontrado
    return new Response('Not found', { status: 404 });
  },
  
  // Processamento em segundo plano para agregação de métricas
  async scheduled(event, env, ctx) {
    // Agregação diária às 00:00 UTC
    if (event.cron === '0 0 * * *') {
      await aggregateDailyMetrics(env);
    }
    
    // Limpeza de métricas antigas (manter apenas 90 dias)
    if (event.cron === '0 1 * * 0') { // Domingo à 01:00 UTC
      await cleanupOldMetrics(env);
    }
  }
};

/**
 * Processa dados de performance recebidos do cliente
 */
async function handlePerformanceData(request, env, ctx) {
  try {
    // Extrair dados da requisição
    const data = await request.json();
    const { lcp, fid, cls, ttfb, url: pageUrl } = data;
    
    if (!pageUrl) {
      return jsonResponse({ error: 'URL da página não fornecida' }, 400);
    }
    
    // Extrair informações adicionais
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const country = request.headers.get('CF-IPCountry') || 'unknown';
    const timestamp = Date.now();
    
    // Criar objeto de métrica enriquecido
    const metricEntry = {
      timestamp,
      pageUrl: new URL(pageUrl).pathname, // Normalizar para apenas o path
      metrics: {
        lcp: lcp || null,
        fid: fid || null,
        cls: cls || null,
        ttfb: ttfb || null
      },
      context: {
        ip: clientIP,
        userAgent,
        country,
        mobile: /mobile|android|iphone|ipad|ipod/i.test(userAgent)
      }
    };
    
    // Gerar ID único para a entrada
    const id = crypto.randomUUID();
    const key = `metric:${id}`;
    
    // Salvar no KV
    await env.PERFORMANCE_METRICS.put(key, JSON.stringify(metricEntry));
    
    // Atualizar contadores por página
    await updatePageMetricsCounters(metricEntry, env);
    
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Erro ao processar dados de performance:', error);
    return jsonResponse({ error: 'Erro ao processar requisição' }, 500);
  }
}

/**
 * Atualiza contadores de métricas por página
 */
async function updatePageMetricsCounters(entry, env) {
  const { pageUrl, metrics, context } = entry;
  const date = new Date();
  const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  
  // Chave para os contadores da página
  const pageKey = `page:${pageUrl}:${dateKey}`;
  
  // Obter contadores atuais ou criar novos
  let pageCounters = await env.PERFORMANCE_METRICS.get(pageKey, { type: 'json' });
  if (!pageCounters) {
    pageCounters = {
      pageUrl,
      date: dateKey,
      visitCount: 0,
      deviceCounts: { mobile: 0, desktop: 0 },
      countryCounts: {},
      metrics: {
        lcp: { count: 0, sum: 0, good: 0 },
        fid: { count: 0, sum: 0, good: 0 },
        cls: { count: 0, sum: 0, good: 0 },
        ttfb: { count: 0, sum: 0, good: 0 }
      }
    };
  }
  
  // Incrementar contadores
  pageCounters.visitCount++;
  
  // Contar por dispositivo
  if (context.mobile) {
    pageCounters.deviceCounts.mobile++;
  } else {
    pageCounters.deviceCounts.desktop++;
  }
  
  // Contar por país
  if (context.country) {
    pageCounters.countryCounts[context.country] = 
      (pageCounters.countryCounts[context.country] || 0) + 1;
  }
  
  // Atualizar métricas
  for (const [metricName, metricValue] of Object.entries(metrics)) {
    if (metricValue !== null && metricValue !== undefined) {
      pageCounters.metrics[metricName].count++;
      pageCounters.metrics[metricName].sum += metricValue;
      
      // Contar "bons" valores por métrica
      let isGood = false;
      if (metricName === 'lcp' && metricValue < 2500) isGood = true;
      if (metricName === 'fid' && metricValue < 100) isGood = true;
      if (metricName === 'cls' && metricValue < 0.1) isGood = true;
      if (metricName === 'ttfb' && metricValue < 800) isGood = true;
      
      if (isGood) {
        pageCounters.metrics[metricName].good++;
      }
    }
  }
  
  // Salvar contadores atualizados
  await env.PERFORMANCE_METRICS.put(pageKey, JSON.stringify(pageCounters));
  
  // Também atualizar contadores globais
  const globalKey = `global:${dateKey}`;
  let globalCounters = await env.PERFORMANCE_METRICS.get(globalKey, { type: 'json' });
  
  if (!globalCounters) {
    globalCounters = {
      date: dateKey,
      visitCount: 0,
      deviceCounts: { mobile: 0, desktop: 0 },
      countryCounts: {},
      metrics: {
        lcp: { count: 0, sum: 0, good: 0 },
        fid: { count: 0, sum: 0, good: 0 },
        cls: { count: 0, sum: 0, good: 0 },
        ttfb: { count: 0, sum: 0, good: 0 }
      },
      pages: {}
    };
  }
  
  // Incrementar contadores globais
  globalCounters.visitCount++;
  
  // Por dispositivo
  if (context.mobile) {
    globalCounters.deviceCounts.mobile++;
  } else {
    globalCounters.deviceCounts.desktop++;
  }
  
  // Por país
  if (context.country) {
    globalCounters.countryCounts[context.country] = 
      (globalCounters.countryCounts[context.country] || 0) + 1;
  }
  
  // Por página
  globalCounters.pages[pageUrl] = (globalCounters.pages[pageUrl] || 0) + 1;
  
  // Métricas globais
  for (const [metricName, metricValue] of Object.entries(metrics)) {
    if (metricValue !== null && metricValue !== undefined) {
      globalCounters.metrics[metricName].count++;
      globalCounters.metrics[metricName].sum += metricValue;
      
      // Contar "bons" valores por métrica
      let isGood = false;
      if (metricName === 'lcp' && metricValue < 2500) isGood = true;
      if (metricName === 'fid' && metricValue < 100) isGood = true;
      if (metricName === 'cls' && metricValue < 0.1) isGood = true;
      if (metricName === 'ttfb' && metricValue < 800) isGood = true;
      
      if (isGood) {
        globalCounters.metrics[metricName].good++;
      }
    }
  }
  
  // Salvar contadores globais
  await env.PERFORMANCE_METRICS.put(globalKey, JSON.stringify(globalCounters));
}

/**
 * Obtém dados do dashboard de performance
 */
async function getDashboardData(request, env, ctx) {
  try {
    const url = new URL(request.url);
    
    // Obter parâmetros
    const days = parseInt(url.searchParams.get('days') || '7');
    
    // Limitar a 30 dias no máximo
    const limitedDays = Math.min(days, 30);
    
    // Obter as datas para o período
    const dateKeys = [];
    const today = new Date();
    
    for (let i = 0; i < limitedDays; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dateKeys.push(dateKey);
    }
    
    // Buscar dados para cada dia
    const dailyDataPromises = dateKeys.map(async (dateKey) => {
      const key = `global:${dateKey}`;
      return env.PERFORMANCE_METRICS.get(key, { type: 'json' });
    });
    
    // Aguardar resultados
    const dailyData = await Promise.all(dailyDataPromises);
    
    // Filtrar dias sem dados
    const validDailyData = dailyData.filter(day => day !== null);
    
    // Agregar dados
    const aggregatedData = {
      period: {
        start: dateKeys[dateKeys.length - 1],
        end: dateKeys[0]
      },
      totals: {
        visitCount: 0,
        devices: { mobile: 0, desktop: 0 },
        topCountries: {},
        topPages: {}
      },
      metrics: {
        lcp: { avg: 0, good: 0, count: 0 },
        fid: { avg: 0, good: 0, count: 0 },
        cls: { avg: 0, good: 0, count: 0 },
        ttfb: { avg: 0, good: 0, count: 0 }
      },
      dailyTrends: validDailyData.map(day => ({
        date: day.date,
        visitCount: day.visitCount,
        metrics: {
          lcp: day.metrics.lcp.count > 0 ? 
            { avg: day.metrics.lcp.sum / day.metrics.lcp.count, goodPercent: (day.metrics.lcp.good / day.metrics.lcp.count) * 100 } : null,
          fid: day.metrics.fid.count > 0 ? 
            { avg: day.metrics.fid.sum / day.metrics.fid.count, goodPercent: (day.metrics.fid.good / day.metrics.fid.count) * 100 } : null,
          cls: day.metrics.cls.count > 0 ? 
            { avg: day.metrics.cls.sum / day.metrics.cls.count, goodPercent: (day.metrics.cls.good / day.metrics.cls.count) * 100 } : null
        }
      })).sort((a, b) => a.date.localeCompare(b.date)) // Ordenar por data crescente
    };
    
    // Calcular totais
    for (const day of validDailyData) {
      // Visitas
      aggregatedData.totals.visitCount += day.visitCount;
      
      // Dispositivos
      aggregatedData.totals.devices.mobile += day.deviceCounts.mobile || 0;
      aggregatedData.totals.devices.desktop += day.deviceCounts.desktop || 0;
      
      // Países
      for (const [country, count] of Object.entries(day.countryCounts || {})) {
        aggregatedData.totals.topCountries[country] = 
          (aggregatedData.totals.topCountries[country] || 0) + count;
      }
      
      // Páginas
      for (const [page, count] of Object.entries(day.pages || {})) {
        aggregatedData.totals.topPages[page] = 
          (aggregatedData.totals.topPages[page] || 0) + count;
      }
      
      // Métricas
      for (const metric of ['lcp', 'fid', 'cls', 'ttfb']) {
        if (day.metrics[metric]) {
          aggregatedData.metrics[metric].count += day.metrics[metric].count || 0;
          aggregatedData.metrics[metric].good += day.metrics[metric].good || 0;
          aggregatedData.metrics[metric].avg += day.metrics[metric].sum || 0;
        }
      }
    }
    
    // Calcular médias
    for (const metric of ['lcp', 'fid', 'cls', 'ttfb']) {
      if (aggregatedData.metrics[metric].count > 0) {
        aggregatedData.metrics[metric].avg = aggregatedData.metrics[metric].avg / aggregatedData.metrics[metric].count;
        aggregatedData.metrics[metric].goodPercent = (aggregatedData.metrics[metric].good / aggregatedData.metrics[metric].count) * 100;
      }
    }
    
    // Transformar objetos em arrays ordenados
    aggregatedData.totals.topCountries = Object.entries(aggregatedData.totals.topCountries)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    aggregatedData.totals.topPages = Object.entries(aggregatedData.totals.topPages)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return jsonResponse(aggregatedData);
  } catch (error) {
    console.error('Erro ao obter dados do dashboard:', error);
    return jsonResponse({ error: 'Erro ao obter dados do dashboard' }, 500);
  }
}

/**
 * Obtém métricas para uma página específica
 */
async function getPageAnalytics(request, env, ctx) {
  try {
    const url = new URL(request.url);
    
    // Parâmetros
    const page = url.searchParams.get('page');
    const days = parseInt(url.searchParams.get('days') || '7');
    
    if (!page) {
      return jsonResponse({ error: 'Página não especificada' }, 400);
    }
    
    // Limitar a 30 dias no máximo
    const limitedDays = Math.min(days, 30);
    
    // Obter datas para o período
    const dateKeys = [];
    const today = new Date();
    
    for (let i = 0; i < limitedDays; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dateKeys.push(dateKey);
    }
    
    // Buscar dados para cada dia
    const dailyDataPromises = dateKeys.map(async (dateKey) => {
      const key = `page:${page}:${dateKey}`;
      return env.PERFORMANCE_METRICS.get(key, { type: 'json' });
    });
    
    // Aguardar resultados
    const dailyData = await Promise.all(dailyDataPromises);
    
    // Filtrar dias sem dados
    const validDailyData = dailyData.filter(day => day !== null);
    
    // Se não houver dados, retornar vazio
    if (validDailyData.length === 0) {
      return jsonResponse({
        page,
        period: {
          start: dateKeys[dateKeys.length - 1],
          end: dateKeys[0]
        },
        dailyData: [],
        metrics: {
          lcp: null,
          fid: null,
          cls: null,
          ttfb: null
        }
      });
    }
    
    // Agregar dados
    const aggregatedData = {
      page,
      period: {
        start: dateKeys[dateKeys.length - 1],
        end: dateKeys[0]
      },
      visitCount: 0,
      deviceCounts: { mobile: 0, desktop: 0 },
      metrics: {
        lcp: { count: 0, sum: 0, good: 0 },
        fid: { count: 0, sum: 0, good: 0 },
        cls: { count: 0, sum: 0, good: 0 },
        ttfb: { count: 0, sum: 0, good: 0 }
      },
      dailyData: validDailyData.map(day => ({
        date: day.date,
        visitCount: day.visitCount,
        metrics: {
          lcp: day.metrics.lcp.count > 0 ? 
            { avg: day.metrics.lcp.sum / day.metrics.lcp.count, goodPercent: (day.metrics.lcp.good / day.metrics.lcp.count) * 100 } : null,
          fid: day.metrics.fid.count > 0 ? 
            { avg: day.metrics.fid.sum / day.metrics.fid.count, goodPercent: (day.metrics.fid.good / day.metrics.fid.count) * 100 } : null,
          cls: day.metrics.cls.count > 0 ? 
            { avg: day.metrics.cls.sum / day.metrics.cls.count, goodPercent: (day.metrics.cls.good / day.metrics.cls.count) * 100 } : null,
          ttfb: day.metrics.ttfb.count > 0 ? 
            { avg: day.metrics.ttfb.sum / day.metrics.ttfb.count, goodPercent: (day.metrics.ttfb.good / day.metrics.ttfb.count) * 100 } : null
        }
      })).sort((a, b) => a.date.localeCompare(b.date)) // Ordenar por data crescente
    };
    
    // Calcular totais
    for (const day of validDailyData) {
      // Visitas
      aggregatedData.visitCount += day.visitCount;
      
      // Dispositivos
      aggregatedData.deviceCounts.mobile += day.deviceCounts.mobile || 0;
      aggregatedData.deviceCounts.desktop += day.deviceCounts.desktop || 0;
      
      // Métricas
      for (const metric of ['lcp', 'fid', 'cls', 'ttfb']) {
        if (day.metrics[metric]) {
          aggregatedData.metrics[metric].count += day.metrics[metric].count || 0;
          aggregatedData.metrics[metric].good += day.metrics[metric].good || 0;
          aggregatedData.metrics[metric].sum += day.metrics[metric].sum || 0;
        }
      }
    }
    
    // Calcular médias finais
    const metricsResult = {};
    for (const metric of ['lcp', 'fid', 'cls', 'ttfb']) {
      if (aggregatedData.metrics[metric].count > 0) {
        metricsResult[metric] = {
          avg: aggregatedData.metrics[metric].sum / aggregatedData.metrics[metric].count,
          goodPercent: (aggregatedData.metrics[metric].good / aggregatedData.metrics[metric].count) * 100,
          count: aggregatedData.metrics[metric].count
        };
      } else {
        metricsResult[metric] = null;
      }
    }
    
    return jsonResponse({
      page,
      period: aggregatedData.period,
      visitCount: aggregatedData.visitCount,
      deviceCounts: aggregatedData.deviceCounts,
      metrics: metricsResult,
      dailyData: aggregatedData.dailyData
    });
  } catch (error) {
    console.error('Erro ao obter métricas da página:', error);
    return jsonResponse({ error: 'Erro ao obter métricas da página' }, 500);
  }
}

/**
 * Agrega métricas diárias
 */
async function aggregateDailyMetrics(env) {
  // Implementação da agregação diária
  // ...
}

/**
 * Limpa métricas antigas para economizar armazenamento
 */
async function cleanupOldMetrics(env) {
  // Implementação da limpeza
  // ...
}

/**
 * Retorna resposta JSON formatada
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=0'
    }
  });
}