import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import { RSI, MACD, BollingerBands, EMA, Stochastic, ATR, OBV } from 'technicalindicators';
import TradingAgent from './agent';
import { computePnl } from './trading/risk-manager';
import { getTradeLogger } from './memory/trade-logger';
import BinanceClient from './config/binance';

/**
 * Servidor Express para Dashboard
 * Puerto: 3000
 * URL: http://localhost:3000
 */

const app = express();
const PORT = process.env.PORT || 3000;
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || '';
const MAX_CAPITAL = 10_000_000;

// Middleware
// CORS cerrado por defecto: el dashboard se sirve desde el mismo origen
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map(o => o.trim()) }));
}
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Autenticación de la API
 * - Las peticiones que modifican estado deben llevar la cabecera X-Requested-With (bloquea CSRF:
 *   una web ajena no puede enviarla sin preflight CORS, que está desactivado)
 * - Si DASHBOARD_TOKEN está definido, se exige `Authorization: Bearer <token>`
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/health') return next();

  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'dashboard') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }

  if (!DASHBOARD_TOKEN) return next();

  const header = req.get('Authorization') || '';
  const provided = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(DASHBOARD_TOKEN);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  return next();
}

app.use('/api', requireAuth);

/**
 * Responde un error genérico y registra el detalle solo en el servidor
 */
function sendError(res: Response, context: string, error: unknown) {
  console.error(`❌ Error en ${context}:`, error);
  return res.status(500).json({ error: `Error interno en ${context}` });
}

// Estado global del servidor
let agentInstance: TradingAgent | null = null;
let agentStarting: Promise<void> | null = null;
let tradingExchange: 'binance' | 'bybit' | 'both' = 'binance'; // Exchange seleccionado

// Cliente de mercado compartido (evita recrear ccxt y recargar mercados en cada petición)
let marketClient: BinanceClient | null = null;
function getMarketClient(): BinanceClient {
  if (!marketClient) {
    marketClient = new BinanceClient();
  }
  return marketClient;
}

/**
 * API: Obtener estado del agente
 */
app.get('/api/status', (_req: Request, res: Response) => {
  try {
    if (!agentInstance) {
      return res.json({
        running: false,
        message: agentStarting ? 'Agente iniciándose' : 'Agente no iniciado'
      });
    }

    const riskManager = agentInstance.getRiskManager();
    const state = agentInstance.getStatus();
    const riskState = riskManager.getState();
    const stats = riskManager.getStats();

    return res.json({
      running: state.isRunning,
      paused: state.isPaused,
      lastUpdate: state.lastUpdate,
      ordersToday: state.ordersToday,
      signalsFound: state.signalsFound,
      capital: riskState.totalCapital,
      availableCapital: riskState.availableCapital,
      usedCapital: riskState.usedCapital,
      openPositions: riskState.openPositions,
      dailyLoss: riskState.dailyLoss,
      maxDailyLoss: riskState.maxDailyLoss,
      stats: {
        totalTrades: stats.totalTrades,
        winningTrades: stats.winningTrades,
        losingTrades: stats.losingTrades,
        winRate: stats.winRate.toFixed(2),
        totalPnL: stats.totalPnL.toFixed(2),
        returnPercent: stats.returnPercent.toFixed(2)
      }
    });
  } catch (error) {
    return sendError(res, 'status', error);
  }
});

/**
 * API: Obtener posiciones abiertas
 */
app.get('/api/positions', async (_req: Request, res: Response) => {
  try {
    const tradeLogger = getTradeLogger();
    const positions = await tradeLogger.getOpenPositions();

    return res.json(
      positions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        entryPrice: Number(p.entryPrice).toFixed(2),
        quantity: Number(p.quantity).toFixed(6),
        riskAmount: Number(p.riskAmount).toFixed(2),
        stopLoss: Number(p.stopLoss).toFixed(2),
        takeProfit: Number(p.takeProfit).toFixed(2),
        timestamp: new Date(p.timestamp).toLocaleString('es-ES')
      }))
    );
  } catch (error) {
    return sendError(res, 'positions', error);
  }
});

/**
 * API: Obtener histórico de trades cerrados
 */
app.get('/api/trades', async (_req: Request, res: Response) => {
  try {
    const tradeLogger = getTradeLogger();
    const trades = await tradeLogger.getAllTrades(50);

    return res.json(
      trades.map(p => {
        const entryPrice = Number(p.entryPrice);
        const exitPrice = p.exitPrice !== undefined && p.exitPrice !== null ? Number(p.exitPrice) : null;
        const quantity = Number(p.quantity);
        const pnl = exitPrice !== null ? computePnl(p.side, entryPrice, exitPrice, quantity) : null;

        return {
          id: p.id,
          symbol: p.symbol,
          side: p.side,
          entryPrice: entryPrice.toFixed(2),
          exitPrice: exitPrice !== null ? exitPrice.toFixed(2) : 'N/A',
          quantity: quantity.toFixed(6),
          pnl: pnl !== null ? pnl.toFixed(2) : 'N/A',
          pnlPercent: pnl !== null ? ((pnl / (entryPrice * quantity)) * 100).toFixed(2) : 'N/A',
          reason: p.exitReason || 'manual',
          timestamp: new Date(p.timestamp).toLocaleString('es-ES')
        };
      })
    );
  } catch (error) {
    return sendError(res, 'trades', error);
  }
});

/**
 * API: Iniciar agente
 */
app.post('/api/agent/start', async (req: Request, res: Response) => {
  if (agentInstance || agentStarting) {
    return res.json({ message: 'Agente ya está corriendo' });
  }

  const rawCapital = req.body?.capital ?? 10000;
  const initialCapital = Number(rawCapital);
  if (!Number.isFinite(initialCapital) || initialCapital <= 0 || initialCapital > MAX_CAPITAL) {
    return res.status(400).json({ error: `Capital inválido (debe estar entre 0 y ${MAX_CAPITAL})` });
  }

  const agent = new TradingAgent(initialCapital);
  agent.preferredExchange = tradingExchange;
  agentStarting = agent.start();

  try {
    await agentStarting;
    agentInstance = agent;
    return res.json({
      success: true,
      message: 'Agente iniciado',
      capital: initialCapital
    });
  } catch (error) {
    agent.stop();
    return sendError(res, 'agent/start', error);
  } finally {
    agentStarting = null;
  }
});

/**
 * API: Pausar agente
 */
app.post('/api/agent/pause', (_req: Request, res: Response) => {
  if (!agentInstance) {
    return res.status(400).json({ error: 'Agente no está corriendo' });
  }

  agentInstance.pause();
  return res.json({ success: true, message: 'Agente pausado' });
});

/**
 * API: Reanudar agente
 */
app.post('/api/agent/resume', (_req: Request, res: Response) => {
  if (!agentInstance) {
    return res.status(400).json({ error: 'Agente no está corriendo' });
  }

  agentInstance.resume();
  return res.json({ success: true, message: 'Agente reanudado' });
});

/**
 * API: Cerrar todas las posiciones
 */
app.post('/api/agent/close-all', async (_req: Request, res: Response) => {
  try {
    if (!agentInstance) {
      return res.status(400).json({ error: 'Agente no está corriendo' });
    }

    await agentInstance.closeAll();
    return res.json({ success: true, message: 'Todas las posiciones cerradas' });
  } catch (error) {
    return sendError(res, 'agent/close-all', error);
  }
});

/**
 * API: Generar reporte
 */
app.post('/api/agent/report', async (_req: Request, res: Response) => {
  try {
    if (!agentInstance) {
      return res.status(400).json({ error: 'Agente no está corriendo' });
    }

    await agentInstance.generateReport();
    return res.json({ success: true, message: 'Reporte generado' });
  } catch (error) {
    return sendError(res, 'agent/report', error);
  }
});

/**
 * API: Cambiar temporalidades del agente
 */
app.post('/api/agent/set-timeframes', (req: Request, res: Response) => {
  const timeframes = req.body?.timeframes as unknown;

  if (!Array.isArray(timeframes) || timeframes.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Debes proporcionar al menos un timeframe válido'
    });
  }

  // Validar que sean timeframes válidos
  const validTimeframes = ['1m', '5m'];
  const allValid = timeframes.every(tf => typeof tf === 'string' && validTimeframes.includes(tf));

  if (!allValid) {
    return res.status(400).json({
      success: false,
      error: `Timeframes inválidos. Opciones válidas: ${validTimeframes.join(', ')}`
    });
  }

  // Cambiar los timeframes del agente si está corriendo
  if (agentInstance) {
    agentInstance.setTimeframes(timeframes as ('1m' | '5m')[]);
  } else {
    console.log(`\n⏱️ Timeframes configurados (agente se aplicará cuando inicie): ${timeframes.join(', ')}`);
  }

  return res.json({
    success: true,
    message: `Temporalidades configuradas: ${timeframes.join(', ')}`,
    currentTimeframes: timeframes,
    agentRunning: !!agentInstance
  });
});

/**
 * API: Cambiar exchange de trading
 */
app.post('/api/config/exchange', (req: Request, res: Response) => {
  const exchange = req.body?.exchange as 'binance' | 'bybit' | 'both';

  if (!['binance', 'bybit', 'both'].includes(exchange)) {
    return res.status(400).json({
      error: 'Exchange inválido. Opciones: binance, bybit, both'
    });
  }

  tradingExchange = exchange;

  // Actualizar el agente si está corriendo
  if (agentInstance) {
    agentInstance.preferredExchange = exchange;
  }

  console.log(`\n🔄 Exchange cambiado a: ${exchange.toUpperCase()}`);

  return res.json({
    success: true,
    message: `Exchange configurado a: ${exchange}`,
    currentExchange: tradingExchange
  });
});

/**
 * API: Obtener configuración actual
 */
app.get('/api/config/exchange', (_req: Request, res: Response) => {
  return res.json({
    currentExchange: tradingExchange,
    options: ['binance', 'bybit', 'both']
  });
});

/**
 * API: Obtener estadísticas del día
 */
app.get('/api/stats/daily', async (_req: Request, res: Response) => {
  try {
    const tradeLogger = getTradeLogger();
    const stats = await tradeLogger.getDailyStats();
    return res.json(stats);
  } catch (error) {
    return sendError(res, 'stats/daily', error);
  }
});

/**
 * API: Obtener estadísticas generales
 */
app.get('/api/stats/overall', async (_req: Request, res: Response) => {
  try {
    const tradeLogger = getTradeLogger();
    const stats = await tradeLogger.getOverallStats();
    return res.json(stats);
  } catch (error) {
    return sendError(res, 'stats/overall', error);
  }
});

// Número de velas a obtener por timeframe del gráfico
const CHART_LIMITS: Record<string, number> = {
  '1h': 24,   // 24 velas de 1h = 1 día
  '4h': 30,   // 30 velas de 4h = 5 días
  '1d': 30,   // 30 velas de 1 día = 1 mes
  '1w': 12,   // 12 velas de 1 semana = 3 meses
  '1M': 12    // 12 velas de 1 mes = 1 año
};
const SYMBOL_PATTERN = /^[A-Z0-9]{2,15}\/USDT$/;

/**
 * Alinea una serie de indicador (más corta) con las velas: devuelve el valor de la vela `index`
 */
function alignedValue<T>(values: T[], totalCandles: number, index: number): T | null {
  const offset = totalCandles - values.length;
  return index >= offset ? values[index - offset] ?? null : null;
}

/**
 * API: Obtener datos de gráfico (OHLCV + indicadores)
 */
app.get('/api/chart-data', async (req: Request, res: Response) => {
  try {
    const symbol = typeof req.query.symbol === 'string' ? req.query.symbol : 'BTC/USDT';
    const timeframe = typeof req.query.period === 'string' ? req.query.period : '1h';

    if (!SYMBOL_PATTERN.test(symbol)) {
      return res.status(400).json({ error: 'Símbolo inválido' });
    }
    if (!(timeframe in CHART_LIMITS)) {
      return res.status(400).json({ error: `Periodo inválido. Opciones: ${Object.keys(CHART_LIMITS).join(', ')}` });
    }

    const limit = CHART_LIMITS[timeframe];
    const ohlcvData: number[][] = await getMarketClient().getOHLCV(symbol, timeframe, limit);

    const closes = ohlcvData.map(candle => candle[4]);
    const highs = ohlcvData.map(candle => candle[2]);
    const lows = ohlcvData.map(candle => candle[3]);
    const volumes = ohlcvData.map(candle => candle[5]);

    // Calcular indicadores (una sola pasada cada uno)
    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    const bbValues = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 });
    const ema20Values = EMA.calculate({ values: closes, period: 20 });
    const stochasticValues = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
    const obvValues = OBV.calculate({ close: closes, volume: volumes });

    const total = ohlcvData.length;
    const chartData = ohlcvData.map((candle, index) => ({
      time: new Date(candle[0]).toISOString(),
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5],
      rsi: alignedValue(rsiValues, total, index),
      macd: alignedValue(macdValues, total, index),
      bb: alignedValue(bbValues, total, index),
      ema20: alignedValue(ema20Values, total, index),
      stochastic: alignedValue(stochasticValues, total, index),
      atr: alignedValue(atrValues, total, index),
      obv: alignedValue(obvValues, total, index)
    }));

    return res.json({
      symbol,
      timeframe,
      data: chartData
    });
  } catch (error) {
    return sendError(res, 'chart-data', error);
  }
});

/**
 * Health check
 */
app.get('/api/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'ok',
    agentRunning: agentInstance?.getStatus().isRunning || false
  });
});

/**
 * Servir dashboard
 */
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

/**
 * Iniciar servidor
 */
app.listen(PORT, () => {
  console.log(`\n🌐 Dashboard disponible en http://localhost:${PORT}\n`);
  if (!DASHBOARD_TOKEN) {
    console.warn('⚠️ DASHBOARD_TOKEN no configurado: la API no exige autenticación. Defínelo si el servidor es accesible desde fuera.');
  }
  console.log('📊 Endpoints API:');
  console.log(`  GET  /api/status       - Estado del agente`);
  console.log(`  GET  /api/positions    - Posiciones abiertas`);
  console.log(`  GET  /api/trades       - Histórico de trades`);
  console.log(`  POST /api/agent/start  - Iniciar agente`);
  console.log(`  POST /api/agent/pause  - Pausar agente`);
  console.log(`  POST /api/agent/resume - Reanudar agente`);
  console.log(`  POST /api/agent/close-all - Cerrar todas las posiciones\n`);
});

export default app;
