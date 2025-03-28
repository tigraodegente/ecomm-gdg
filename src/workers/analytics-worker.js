/**
 * Worker para coleta e análise de métricas de performance
 * 
 * Este worker coleta Core Web Vitals e outras métricas de performance,
 * armazena no KV e fornece endpoints para visualização de dashboards.
 * Otimizado para Cloudflare Workers e KV Storage.
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
    
    // Endpoint para dados em tempo real
    if (url.pathname === '/api/analytics/realtime' && request.method === 'GET') {
      return await getRealTimeAnalytics(request, env, ctx);
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
    
    // Gerar relatório de performance semanal
    if (event.cron === '0 3 * * 1') { // Segunda às 03:00 UTC
      await generateWeeklyReport(env);
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
    const { lcp, fid, cls, ttfb, fcp, url: pageUrl, connection, deviceMemory, effectiveType } = data;
    
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
        ttfb: ttfb || null,
        fcp: fcp || null
      },
      context: {
        ip: clientIP,
        userAgent,
        country,
        mobile: /mobile|android|iphone|ipad|ipod/i.test(userAgent),
        connection: connection || null,
        deviceMemory: deviceMemory || null,
        effectiveType: effectiveType || null
      }
    };
    
    // Gerar ID único para a entrada
    const id = crypto.randomUUID();
    const key = `metric:${id}`;
    
    // Salvar no KV com TTL de 90 dias
    await env.PERFORMANCE_METRICS.put(key, JSON.stringify(metricEntry), {
      expirationTtl: 60 * 60 * 24 * 90 // 90 dias
    });
    
    // Atualizar contadores por página
    ctx.waitUntil(updatePageMetricsCounters(metricEntry, env));
    
    // Atualizar métricas em tempo real
    ctx.waitUntil(updateRealTimeMetrics(metricEntry, env));
    
    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Erro ao processar dados de performance:', error);
    return jsonResponse({ error: 'Erro ao processar requisição' }, 500);
  }
}

/**
 * Atualiza métricas em tempo real
 */
async function updateRealTimeMetrics(entry, env) {
  try {
    const { metrics, pageUrl } = entry;
    const realTimeKey = 'realtime:metrics';
    
    // Obter dados em tempo real existentes
    let realTimeData = await env.PERFORMANCE_METRICS.get(realTimeKey, { type: 'json' });
    
    if (!realTimeData) {
      realTimeData = {
        lastUpdated: Date.now(),
        lastMinute: {
          pageViews: 0,
          uniquePages: new Set(),
          metrics: {
            lcp: [],
            fid: [],
            cls: [],
            ttfb: [],
            fcp: []
          }
        }
      };
    } else {
      // Converter a propriedade Set serializada de volta para um Set real
      realTimeData.lastMinute.uniquePages = new Set(realTimeData.lastMinute.uniquePages || []);
    }
    
    // Verificar se os dados são de mais de 5 minutos atrás
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    if (realTimeData.lastUpdated < fiveMinutesAgo) {
      // Resetar dados
      realTimeData = {
        lastUpdated: Date.now(),
        lastMinute: {
          pageViews: 0,
          uniquePages: new Set(),
          metrics: {
            lcp: [],
            fid: [],
            cls: [],
            ttfb: [],
            fcp: []
          }
        }
      };
    }
    
    // Atualizar dados
    realTimeData.lastUpdated = Date.now();
    realTimeData.lastMinute.pageViews++;
    realTimeData.lastMinute.uniquePages.add(pageUrl);
    
    // Adicionar métricas (manter apenas as últimas 100 por tipo)
    for (const [metricName, metricValue] of Object.entries(metrics)) {
      if (metricValue !== null) {
        if (!realTimeData.lastMinute.metrics[metricName]) {
          realTimeData.lastMinute.metrics[metricName] = [];
        }
        
        realTimeData.lastMinute.metrics[metricName].push(metricValue);
        
        // Limitar a 100 valores
        if (realTimeData.lastMinute.metrics[metricName].length > 100) {
          realTimeData.lastMinute.metrics[metricName].shift();
        }
      }
    }
    
    // Converter back para formato JSON (Set -> Array)
    const dataToStore = {
      ...realTimeData,
      lastMinute: {
        ...realTimeData.lastMinute,
        uniquePages: Array.from(realTimeData.lastMinute.uniquePages)
      }
    };
    
    // Salvar de volta no KV com TTL de 10 minutos
    await env.PERFORMANCE_METRICS.put(realTimeKey, JSON.stringify(dataToStore), {
      expirationTtl: 60 * 10 // 10 minutos
    });
  } catch (error) {
    console.error('Erro ao atualizar métricas em tempo real:', error);
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
        ttfb: { count: 0, sum: 0, good: 0 },
        fcp: { count: 0, sum: 0, good: 0 }
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
      if (metricName === 'fcp' && metricValue < 1800) isGood = true;
      
      if (isGood) {
        pageCounters.metrics[metricName].good++;
      }
    }
  }
  
  // Salvar contadores atualizados
  await env.PERFORMANCE_METRICS.put(pageKey, JSON.stringify(pageCounters), {
    expirationTtl: 60 * 60 * 24 * 90 // 90 dias
  });
  
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
        ttfb: { count: 0, sum: 0, good: 0 },
        fcp: { count: 0, sum: 0, good: 0 }
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
      if (metricName === 'fcp' && metricValue < 1800) isGood = true;
      
      if (isGood) {
        globalCounters.metrics[metricName].good++;
      }
    }
  }
  
  // Salvar contadores globais
  await env.PERFORMANCE_METRICS.put(globalKey, JSON.stringify(globalCounters), {
    expirationTtl: 60 * 60 * 24 * 90 // 90 dias
  });
}

/**
 * Obtém dados em tempo real
 */
async function getRealTimeAnalytics(request, env, ctx) {
  try {
    // Verificar autenticação (opcional)
    const authHeader = request.headers.get('Authorization');
    if (authHeader && !isValidAuthToken(authHeader, env)) {
      return jsonResponse({ error: 'Não autorizado' }, 401);
    }
    
    // Obter dados em tempo real
    const realTimeKey = 'realtime:metrics';
    const realTimeData = await env.PERFORMANCE_METRICS.get(realTimeKey, { type: 'json' });
    
    if (!realTimeData) {
      return jsonResponse({
        lastUpdated: null,
        pageViews: 0,
        uniquePages: 0,
        metrics: {
          lcp: null,
          fid: null,
          cls: null,
          ttfb: null,
          fcp: null
        }
      });
    }
    
    // Calcular médias para métricas
    const metricAverages = {};
    for (const [metricName, values] of Object.entries(realTimeData.lastMinute.metrics)) {
      if (values && values.length > 0) {
        const sum = values.reduce((acc, val) => acc + val, 0);
        metricAverages[metricName] = {
          avg: sum / values.length,
          count: values.length,
          // Calcular percentual "bom"
          goodPercent: calculateGoodPercent(metricName, values)
        };
      } else {
        metricAverages[metricName] = null;
      }
    }
    
    return jsonResponse({
      lastUpdated: realTimeData.lastUpdated,
      pageViews: realTimeData.lastMinute.pageViews,
      uniquePages: realTimeData.lastMinute.uniquePages.length,
      metrics: metricAverages
    });
  } catch (error) {
    console.error('Erro ao obter análises em tempo real:', error);
    return jsonResponse({ error: 'Erro ao obter dados em tempo real' }, 500);
  }
}

/**
 * Calcula o percentual de valores "bons" para uma métrica
 */
function calculateGoodPercent(metricName, values) {
  if (!values || values.length === 0) return 0;
  
  let goodThreshold;
  switch (metricName) {
    case 'lcp': goodThreshold = 2500; break;
    case 'fid': goodThreshold = 100; break;
    case 'cls': goodThreshold = 0.1; break;
    case 'ttfb': goodThreshold = 800; break;
    case 'fcp': goodThreshold = 1800; break;
    default: return 0;
  }
  
  const goodCount = values.filter(value => {
    if (metricName === 'cls') {
      return value < goodThreshold;
    } else {
      return value < goodThreshold;
    }
  }).length;
  
  return (goodCount / values.length) * 100;
}

/**
 * Obtém dados do dashboard de performance
 */
async function getDashboardData(request, env, ctx) {
  try {
    const url = new URL(request.url);
    
    // Verificar autenticação (opcional)
    const authHeader = request.headers.get('Authorization');
    if (authHeader && !isValidAuthToken(authHeader, env)) {
      return jsonResponse({ error: 'Não autorizado' }, 401);
    }
    
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
        ttfb: { avg: 0, good: 0, count: 0 },
        fcp: { avg: 0, good: 0, count: 0 }
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
            { avg: day.metrics.cls.sum / day.metrics.cls.count, goodPercent: (day.metrics.cls.good / day.metrics.cls.count) * 100 } : null,
          ttfb: day.metrics.ttfb.count > 0 ? 
            { avg: day.metrics.ttfb.sum / day.metrics.ttfb.count, goodPercent: (day.metrics.ttfb.good / day.metrics.ttfb.count) * 100 } : null,
          fcp: day.metrics.fcp.count > 0 ? 
            { avg: day.metrics.fcp.sum / day.metrics.fcp.count, goodPercent: (day.metrics.fcp.good / day.metrics.fcp.count) * 100 } : null
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
      for (const metric of ['lcp', 'fid', 'cls', 'ttfb', 'fcp']) {
        if (day.metrics[metric]) {
          aggregatedData.metrics[metric].count += day.metrics[metric].count || 0;
          aggregatedData.metrics[metric].good += day.metrics[metric].good || 0;
          aggregatedData.metrics[metric].avg += day.metrics[metric].sum || 0;
        }
      }
    }
    
    // Calcular médias
    for (const metric of ['lcp', 'fid', 'cls', 'ttfb', 'fcp']) {
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
    
    // Adicionar dados em tempo real
    try {
      const realTimeKey = 'realtime:metrics';
      const realTimeData = await env.PERFORMANCE_METRICS.get(realTimeKey, { type: 'json' });
      
      if (realTimeData) {
        aggregatedData.realtime = {
          lastUpdated: realTimeData.lastUpdated,
          pageViews: realTimeData.lastMinute.pageViews,
          uniquePages: realTimeData.lastMinute.uniquePages.length
        };
      }
    } catch (e) {
      // Ignorar erros de tempo real
    }
    
    // Responder com cache curto (5 min)
    return jsonResponse(aggregatedData, 200, 300);
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
    
    // Verificar autenticação (opcional)
    const authHeader = request.headers.get('Authorization');
    if (authHeader && !isValidAuthToken(authHeader, env)) {
      return jsonResponse({ error: 'Não autorizado' }, 401);
    }
    
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
    
    // Buscar dados para cada dia (em paralelo)
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
          ttfb: null,
          fcp: null
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
        ttfb: { count: 0, sum: 0, good: 0 },
        fcp: { count: 0, sum: 0, good: 0 }
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
            { avg: day.metrics.ttfb.sum / day.metrics.ttfb.count, goodPercent: (day.metrics.ttfb.good / day.metrics.ttfb.count) * 100 } : null,
          fcp: day.metrics.fcp.count > 0 ? 
            { avg: day.metrics.fcp.sum / day.metrics.fcp.count, goodPercent: (day.metrics.fcp.good / day.metrics.fcp.count) * 100 } : null
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
      for (const metric of ['lcp', 'fid', 'cls', 'ttfb', 'fcp']) {
        if (day.metrics[metric]) {
          aggregatedData.metrics[metric].count += day.metrics[metric].count || 0;
          aggregatedData.metrics[metric].good += day.metrics[metric].good || 0;
          aggregatedData.metrics[metric].sum += day.metrics[metric].sum || 0;
        }
      }
    }
    
    // Calcular médias finais
    const metricsResult = {};
    for (const metric of ['lcp', 'fid', 'cls', 'ttfb', 'fcp']) {
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
    
    // Responder com cache de 5 minutos
    return jsonResponse({
      page,
      period: aggregatedData.period,
      visitCount: aggregatedData.visitCount,
      deviceCounts: aggregatedData.deviceCounts,
      metrics: metricsResult,
      dailyData: aggregatedData.dailyData
    }, 200, 300);
  } catch (error) {
    console.error('Erro ao obter métricas da página:', error);
    return jsonResponse({ error: 'Erro ao obter métricas da página' }, 500);
  }
}

/**
 * Agrega métricas diárias e gera relatório
 */
async function aggregateDailyMetrics(env) {
  try {
    // Obter data de ontem
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    
    // Obter dados globais do dia
    const globalKey = `global:${dateKey}`;
    const globalData = await env.PERFORMANCE_METRICS.get(globalKey, { type: 'json' });
    
    if (!globalData) {
      console.log(`Nenhum dado encontrado para agregação em ${dateKey}`);
      return;
    }
    
    // Gerar relatório diário
    const dailyReport = {
      date: dateKey,
      visitCount: globalData.visitCount,
      deviceDistribution: {
        mobile: globalData.deviceCounts.mobile,
        desktop: globalData.deviceCounts.desktop,
        mobilePercent: globalData.visitCount > 0 ? 
          (globalData.deviceCounts.mobile / globalData.visitCount) * 100 : 0
      },
      topCountries: Object.entries(globalData.countryCounts || {})
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topPages: Object.entries(globalData.pages || {})
        .map(([page, count]) => ({ page, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      coreWebVitals: {}
    };
    
    // Calcular métricas de Core Web Vitals
    for (const metric of ['lcp', 'fid', 'cls', 'ttfb', 'fcp']) {
      if (globalData.metrics[metric] && globalData.metrics[metric].count > 0) {
        const metricData = globalData.metrics[metric];
        dailyReport.coreWebVitals[metric] = {
          average: metricData.sum / metricData.count,
          goodPercent: (metricData.good / metricData.count) * 100,
          sampleSize: metricData.count
        };
      }
    }
    
    // Armazenar relatório agregado
    const reportKey = `report:daily:${dateKey}`;
    await env.PERFORMANCE_METRICS.put(reportKey, JSON.stringify(dailyReport), {
      expirationTtl: 60 * 60 * 24 * 90 // 90 dias
    });
    
    console.log(`Relatório diário gerado para ${dateKey}`);
  } catch (error) {
    console.error('Erro ao agregar métricas diárias:', error);
  }
}

/**
 * Gera relatório semanal de performance
 */
async function generateWeeklyReport(env) {
  try {
    // Definir período da semana (últimos 7 dias)
    const today = new Date();
    const dates = [];
    
    for (let i = 7; i > 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dates.push(dateKey);
    }
    
    // Obter relatórios diários
    const reportPromises = dates.map(date => 
      env.PERFORMANCE_METRICS.get(`report:daily:${date}`, { type: 'json' })
    );
    
    const dailyReports = await Promise.all(reportPromises);
    const validReports = dailyReports.filter(report => report !== null);
    
    if (validReports.length === 0) {
      console.log('Sem dados suficientes para gerar relatório semanal');
      return;
    }
    
    // Inicializar objeto de relatório semanal
    const weeklyReport = {
      period: {
        start: dates[0],
        end: dates[dates.length - 1]
      },
      totalVisits: 0,
      deviceDistribution: {
        mobile: 0,
        desktop: 0
      },
      dailyTrends: validReports.map(report => ({
        date: report.date,
        visits: report.visitCount,
        coreWebVitals: report.coreWebVitals
      })).sort((a, b) => a.date.localeCompare(b.date)),
      averageMetrics: {
        lcp: { sum: 0, count: 0 },
        fid: { sum: 0, count: 0 },
        cls: { sum: 0, count: 0 },
        ttfb: { sum: 0, count: 0 },
        fcp: { sum: 0, count: 0 }
      },
      topPages: {},
      topCountries: {}
    };
    
    // Agregar dados
    for (const report of validReports) {
      // Visitas
      weeklyReport.totalVisits += report.visitCount;
      
      // Dispositivos
      weeklyReport.deviceDistribution.mobile += report.deviceDistribution.mobile;
      weeklyReport.deviceDistribution.desktop += report.deviceDistribution.desktop;
      
      // Métricas
      for (const metric of ['lcp', 'fid', 'cls', 'ttfb', 'fcp']) {
        if (report.coreWebVitals[metric]) {
          const metricValue = report.coreWebVitals[metric];
          weeklyReport.averageMetrics[metric].sum += metricValue.average * metricValue.sampleSize;
          weeklyReport.averageMetrics[metric].count += metricValue.sampleSize;
        }
      }
      
      // Páginas
      for (const pageData of report.topPages) {
        const { page, count } = pageData;
        weeklyReport.topPages[page] = (weeklyReport.topPages[page] || 0) + count;
      }
      
      // Países
      for (const countryData of report.topCountries) {
        const { country, count } = countryData;
        weeklyReport.topCountries[country] = (weeklyReport.topCountries[country] || 0) + count;
      }
    }
    
    // Calcular médias
    for (const metric of ['lcp', 'fid', 'cls', 'ttfb', 'fcp']) {
      if (weeklyReport.averageMetrics[metric].count > 0) {
        weeklyReport.averageMetrics[metric].average = 
          weeklyReport.averageMetrics[metric].sum / weeklyReport.averageMetrics[metric].count;
      }
    }
    
    // Calcular percentual de dispositivos
    weeklyReport.deviceDistribution.mobilePercent = weeklyReport.totalVisits > 0 ?
      (weeklyReport.deviceDistribution.mobile / weeklyReport.totalVisits) * 100 : 0;
    
    // Converter para arrays ordenados
    weeklyReport.topPages = Object.entries(weeklyReport.topPages)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    weeklyReport.topCountries = Object.entries(weeklyReport.topCountries)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // Salvar relatório semanal
    const weekId = `${dates[0]}_${dates[dates.length - 1]}`;
    await env.PERFORMANCE_METRICS.put(`report:weekly:${weekId}`, JSON.stringify(weeklyReport), {
      expirationTtl: 60 * 60 * 24 * 90 // 90 dias
    });
    
    console.log(`Relatório semanal gerado para ${weekId}`);
  } catch (error) {
    console.error('Erro ao gerar relatório semanal:', error);
  }
}

/**
 * Limpa métricas antigas para economizar armazenamento
 */
async function cleanupOldMetrics(env) {
  try {
    // Listar todas as métricas brutas mais antigas que 30 dias
    const oldestDate = new Date();
    oldestDate.setDate(oldestDate.getDate() - 30);
    
    // Listar chaves de métricas brutas
    const metricKeys = await env.PERFORMANCE_METRICS.list({ prefix: 'metric:' });
    
    // Contador de itens excluídos
    let deletedCount = 0;
    
    // Verificar e excluir chaves antigas
    for (const key of metricKeys.keys) {
      try {
        const data = await env.PERFORMANCE_METRICS.get(key.name, { type: 'json' });
        
        if (data && data.timestamp) {
          const metricDate = new Date(data.timestamp);
          
          if (metricDate < oldestDate) {
            await env.PERFORMANCE_METRICS.delete(key.name);
            deletedCount++;
          }
        }
      } catch (e) {
        // Ignorar erros individuais
      }
    }
    
    console.log(`Limpeza concluída: ${deletedCount} métricas antigas removidas`);
  } catch (error) {
    console.error('Erro ao limpar métricas antigas:', error);
  }
}

/**
 * Verifica se o token de autorização é válido
 */
function isValidAuthToken(authHeader, env) {
  if (!authHeader) return false;
  
  const token = authHeader.replace('Bearer ', '');
  return token === env.ANALYTICS_AUTH_TOKEN;
}

/**
 * Retorna resposta JSON formatada com controle de cache
 */
function jsonResponse(data, status = 200, cacheSeconds = 0) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  } else {
    headers['Cache-Control'] = 'private, no-store';
  }
  
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}