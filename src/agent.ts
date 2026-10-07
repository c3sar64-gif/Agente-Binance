import { randomUUID } from 'crypto';
import BinanceClient from './config/binance';
import { calculateAllIndicators, OHLCV } from './analysis/indicators';
import { detectMarketRegime, isGoodTimeToTrade, getPositionSizeMultiplier } from './analysis/market-regime';
import { generateSignalScore } from './analysis/scorer';
import { RiskManager, Position, computePnl } from './trading/risk-manager';
import { OrderExecutor } from './trading/executor';
import TelegramNotifier from './notifications/telegram';
import { getTradeLogger } from './memory/trade-logger';
import { buildForecast, Forecast, timeframeToMs } from './analysis/forecast';

/**
 * Señal registrada para el dashboard (compras ejecutadas y avisos de venta)
 */
export interface TradeSignal {
  id: string;
  symbol: string;
  timeframe: '1m' | '5m';
  side: 'buy' | 'sell';
  executed: boolean; // false: solo aviso (el agente no abre cortos)
  time: string; // ISO de la vela en la que se produjo
  price: number;
  score: number;
  confidence: number;
  stopLoss?: number;
  takeProfit?: number;
  forecast: Forecast | null;
}

const MAX_SIGNALS = 100;
const SELL_SIGNAL_COOLDOWN_CANDLES = 12; // Un aviso de venta por símbolo/temporalidad cada 12 velas
const FORECAST_HISTORY = 1000; // Velas para buscar análogos (máximo de Binance por petición)

/**
 * Estado del agente
 */
interface AgentState {
  isRunning: boolean;
  isPaused: boolean;
  lastUpdate: Date;
  ordersToday: number;
  signalsFound: number;
}

/**
 * Número máximo de símbolos analizados en paralelo (ccxt aplica rate-limit igualmente)
 */
const SCAN_CONCURRENCY = 4;

/**
 * Ejecuta `worker` sobre `items` con concurrencia limitada
 */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Agente autónomo de trading
 */
class TradingAgent {
  private binanceClient: BinanceClient;
  private riskManager: RiskManager;
  private executor: OrderExecutor;
  private notifier: TelegramNotifier;
  private tradeLogger = getTradeLogger();
  private state: AgentState;
  public preferredExchange: 'binance' | 'bybit' | 'both' = 'binance';
  private symbols: string[] = [
    'BTC/USDT',
    'ETH/USDT',
    'BNB/USDT',
    'SOL/USDT',
    'ADA/USDT',
    'XRP/USDT',
    'DOGE/USDT',
    'AVAX/USDT',
    'LTC/USDT',
    'LINK/USDT',
    'PAXG/USDT'
  ];
  // Temporalidades para operar
  private timeframes: ('1m' | '5m')[] = ['5m', '1m'];
  private scanInterval: NodeJS.Timeout | null = null;
  private lastReportTime: number = 0; // Control para reportes cada hora
  private isScanning = false; // Evita escaneos solapados
  private pauseReason: 'manual' | 'risk' | null = null;
  private signals: TradeSignal[] = []; // Más recientes al final

  constructor(initialCapital: number = 10000) {
    this.binanceClient = new BinanceClient();
    this.riskManager = new RiskManager(initialCapital);
    this.executor = new OrderExecutor(this.riskManager);
    this.notifier = new TelegramNotifier();

    this.state = {
      isRunning: false,
      isPaused: false,
      lastUpdate: new Date(),
      ordersToday: 0,
      signalsFound: 0
    };
  }

  /**
   * Inicia el agente. Lanza un error si no puede arrancar.
   */
  async start(): Promise<void> {
    console.log('\n' + '═'.repeat(80));
    console.log('🤖 INICIANDO AGENTE BINANCEMASTER');
    console.log('═'.repeat(80) + '\n');

    try {
      // Inicializar base de datos Supabase
      console.log('🗄️ Inicializando Supabase PostgreSQL...');
      await this.tradeLogger.initialize();

      // Verificar conexión a Binance
      console.log('📡 Verificando conexión a Binance Testnet...');
      const connected = await this.binanceClient.testConnection();
      if (!connected) {
        throw new Error('No se pudo conectar a Binance');
      }
      console.log('✅ Conexión establecida\n');

      // Conectar Telegram
      await this.notifier.connect();

      this.lastReportTime = Date.now();
      this.state.isRunning = true;

      console.log('🔄 Loop principal iniciado\n');
      console.log('Symbols a monitorear:', this.symbols.join(', '));
      console.log('Timeframes: ' + this.timeframes.join(', '));
      console.log(`Capital inicial: $${this.riskManager.getState().totalCapital.toFixed(2)}\n`);

      // Iniciar loop de escaneo
      this.startScanLoop();

      console.log('Presiona CTRL+C para detener el agente\n');

    } catch (error) {
      console.error('❌ Error iniciando agente:', error);
      await this.notifier.notifyError(`Error iniciando agente: ${error}`);
      throw error;
    }
  }

  /**
   * Inicia el loop de escaneo
   */
  private startScanLoop(): void {
    // Ejecutar cada 1 minuto en producción
    // En desarrollo/test, ejecutar cada 10 segundos
    const interval = process.env.NODE_ENV === 'production' ? 1 * 60 * 1000 : 10 * 1000;

    // Primera ejecución inmediata, después repetir cada intervalo
    void this.tick();
    this.scanInterval = setInterval(() => void this.tick(), interval);
  }

  /**
   * Un ciclo del loop: nunca solapa escaneos
   */
  private async tick(): Promise<void> {
    if (this.isScanning) {
      console.log('⏭️ Escaneo anterior aún en curso, se omite este ciclo');
      return;
    }
    this.isScanning = true;
    try {
      await this.scan();
    } catch (error) {
      console.error('❌ Error en escaneo:', error);
      await this.notifier.notifyError(`Error en escaneo: ${error}`);
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Escanea los símbolos en busca de señales
   */
  private async scan(): Promise<void> {
    const timestamp = new Date().toLocaleTimeString('es-ES');
    console.log(`\n⏰ Escaneo: ${timestamp}`);
    console.log('─'.repeat(80));

    // Vigilar SL/TP siempre, incluso con el agente pausado
    await this.monitorOpenPositions();

    if (this.pauseReason === 'manual') {
      console.log('⏸️ Agente pausado manualmente - solo se vigilan posiciones abiertas');
      return;
    }

    if (!(await this.checkRiskLimits())) {
      return;
    }

    // Escanear cada símbolo en cada timeframe
    for (const timeframe of this.timeframes) {
      await runWithConcurrency(this.symbols, SCAN_CONCURRENCY, symbol => this.analyzeSymbol(symbol, timeframe));
    }

    this.state.lastUpdate = new Date();

    // Mostrar resumen
    const state = this.riskManager.getState();
    console.log(`\n📊 Resumen: ${state.openPositions} posiciones abiertas | Capital disponible: $${state.availableCapital.toFixed(2)}`);

    // Enviar informe cada hora
    const now = Date.now();
    const oneHourInMs = 60 * 60 * 1000;
    if (now - this.lastReportTime > oneHourInMs) {
      await this.notifier.sendDailyReport(this.riskManager);
      this.lastReportTime = now;
    }
  }

  /**
   * Comprueba los límites diario/semanal. Pausa (y reanuda al cambiar de periodo) automáticamente.
   * Devuelve true si se pueden abrir nuevas posiciones.
   */
  private async checkRiskLimits(): Promise<boolean> {
    const state = this.riskManager.getState();
    const dailyHit = this.riskManager.shouldPauseDailyLoss();
    const weeklyHit = this.riskManager.shouldPauseWeeklyLoss();

    if (dailyHit || weeklyHit) {
      if (this.pauseReason !== 'risk') {
        this.pauseReason = 'risk';
        this.state.isPaused = true;
        if (dailyHit) {
          console.log('🛑 ⚠️ LÍMITE DIARIO ALCANZADO - Nuevas entradas pausadas hasta mañana');
          await this.notifier.notifyDailyLimitReached(state.dailyLoss, state.maxDailyLoss);
        } else {
          console.log('🛑 ⚠️ LÍMITE SEMANAL ALCANZADO - Nuevas entradas pausadas hasta la próxima semana');
          await this.notifier.notifyError(
            `Límite semanal alcanzado: pérdida $${state.weeklyLoss.toFixed(2)} / $${state.maxWeeklyLoss.toFixed(2)}`
          );
        }
      }
      return false;
    }

    if (this.pauseReason === 'risk') {
      // Los contadores se han reseteado al cambiar de día/semana
      this.pauseReason = null;
      this.state.isPaused = false;
      console.log('▶️ Límites de pérdida reseteados - Agente reanudado');
    }
    return true;
  }

  /**
   * Cierra las posiciones que han tocado su stop-loss o take-profit
   */
  private async monitorOpenPositions(): Promise<void> {
    const positions = this.riskManager.getOpenPositions();
    if (positions.length === 0) return;

    const symbols = [...new Set(positions.map(p => p.symbol))];
    const priceResults = await Promise.allSettled(symbols.map(s => this.binanceClient.getPrice(s)));
    const prices = new Map<string, number>();
    priceResults.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        prices.set(symbols[i], result.value);
      } else {
        console.error(`❌ No se pudo obtener precio de ${symbols[i]} para vigilar SL/TP:`, result.reason);
      }
    });

    for (const position of positions) {
      const price = prices.get(position.symbol);
      if (price === undefined) continue;

      const isLong = position.side === 'buy';
      const hitStop = isLong ? price <= position.stopLoss : price >= position.stopLoss;
      const hitTarget = isLong ? price >= position.takeProfit : price <= position.takeProfit;

      if (hitStop) {
        await this.closeAndRecord(position, price, 'stop-loss');
      } else if (hitTarget) {
        await this.closeAndRecord(position, price, 'take-profit');
      }
    }
  }

  /**
   * Cierra una posición en el risk manager, la persiste y notifica
   */
  private async closeAndRecord(position: Position, exitPrice: number, reason: string): Promise<void> {
    const closed = this.riskManager.closePosition(position.id, exitPrice, reason);
    if (!closed) return;

    const pnl = computePnl(position.side, position.entryPrice, exitPrice, position.quantity);
    const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;
    console.log(`🔒 ${position.symbol} cerrada por ${reason} @ $${exitPrice} | P&L: $${pnl.toFixed(2)}`);

    const saved = await this.tradeLogger.closeTrade(
      position.symbol,
      position.side,
      position.entryPrice,
      exitPrice,
      position.quantity,
      reason
    );
    if (!saved) {
      await this.notifier.notifyError(`No se pudo guardar el cierre de ${position.symbol} en la base de datos`);
    }

    await this.notifier.notifyPositionClosed(closed, pnl, pnlPercent);
  }

  /**
   * Analiza un símbolo en busca de señales
   */
  private async analyzeSymbol(symbol: string, timeframe: '1m' | '5m' = '5m'): Promise<void> {
    try {
      // Obtener datos OHLCV (ajustar cantidad según timeframe)
      const limit = timeframe === '1m' ? 300 : 240; // Más velas para timeframes bajos
      const ohlcvData = await this.binanceClient.getOHLCV(symbol, timeframe, limit);
      const ohlcv: OHLCV[] = ohlcvData.map(([ts, o, h, l, c, v]: [number, number, number, number, number, number]) => ({
        timestamp: ts,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v
      }));

      if (ohlcv.length === 0) {
        console.warn(`⚠️ ${symbol} [${timeframe}]: sin velas`);
        return;
      }

      const currentPrice = ohlcv[ohlcv.length - 1].close;
      const candleTime = ohlcv[ohlcv.length - 1].timestamp;

      // Detectar régimen de mercado
      const regime = detectMarketRegime(ohlcv);

      // Verificar si es buen momento para operar
      if (!isGoodTimeToTrade(regime)) {
        console.log(`⏸️ ${symbol}: Condiciones no favorables (${regime.regime})`);
        return;
      }

      // Calcular indicadores
      const indicators = calculateAllIndicators(ohlcv);

      // Generar score de señal (con análisis de sentimiento)
      const signalScore = await generateSignalScore(indicators, ohlcv, regime, symbol, timeframe);

      // Mostrar análisis
      console.log(`\n📈 ${symbol} [${timeframe.toUpperCase()}]`);
      console.log(`  Precio: $${currentPrice.toFixed(2)}`);
      console.log(`  Régimen: ${regime.regime.toUpperCase()} (${regime.strength.toFixed(0)}/100)`);
      console.log(`  Señal: ${signalScore.type.toUpperCase()} | Score: ${signalScore.score.toFixed(1)}/10 | Confianza: ${signalScore.confidence.toFixed(0)}%`);
      if (signalScore.strategies && signalScore.strategies.length > 0) {
        console.log(`  🎯 Estrategias: ${signalScore.strategies.join(' | ')}`);
      }
      if (signalScore.sentiment) {
        console.log(`  📰 Sentimiento: ${(signalScore.sentiment.overallSentiment * 100).toFixed(0)}% (${signalScore.sentiment.articlesAnalyzed} noticias)`);
      }

      // Umbrales permisivos
      const minScore = 5.0;
      const minConfidence = 25;

      // Solo largos: en spot no se puede abrir corto y los niveles SL/TP se calculan para compras
      const isValidSignal =
        signalScore.type === 'buy' &&
        signalScore.score > minScore &&
        signalScore.confidence >= minConfidence;

      // Señal de venta: solo aviso visual (no se opera en corto)
      const isSellWarning =
        signalScore.type === 'sell' &&
        signalScore.score < minScore &&
        signalScore.confidence >= minConfidence;

      if (isSellWarning && this.state.isRunning && !this.hasRecentSellSignal(symbol, timeframe, candleTime)) {
        console.log(`  🔻 Señal de venta (aviso, no se opera en corto)`);
        await this.recordSignal({
          symbol,
          timeframe,
          side: 'sell',
          executed: false,
          candleTime,
          price: currentPrice,
          score: signalScore.score,
          confidence: signalScore.confidence
        });
      }

      if (!isValidSignal) {
        if (signalScore.score < 6.5 || signalScore.confidence < 65) {
          console.log(`  ⚪ Señal débil - esperando mayor confianza`);
        }
        return;
      }

      const atr = indicators.atr;
      if (atr === null || !Number.isFinite(atr) || atr <= 0) {
        console.warn(`  ⚠️ ${symbol}: ATR no disponible, se omite la operación`);
        return;
      }

      // El agente se está deteniendo (p. ej. closeAll por SIGINT con un escaneo en curso)
      if (!this.state.isRunning) {
        return;
      }

      // Comprobación síncrona justo antes de abrir para evitar duplicados entre timeframes/escaneos
      if (this.riskManager.getOpenPositions().some(p => p.symbol === symbol)) {
        console.log(`  ↪️ Ya hay una posición abierta en ${symbol}`);
        return;
      }

      console.log(`  ✅ Señal ejecutable detectada`);
      this.state.signalsFound++;

      // Calcular tamaño de posición
      const positionMultiplier = getPositionSizeMultiplier(regime);
      const positionSize = this.riskManager.calculatePositionSize(
        currentPrice,
        atr,
        signalScore.score,
        2, // Ratio 1:2
        positionMultiplier,
        timeframe
      );

      if (!positionSize.isValid) {
        console.log(`  ❌ No se puede abrir: ${positionSize.reason}`);
        return;
      }

      // Calcular niveles (ajustado por timeframe)
      const levels = this.riskManager.calculateLevels(currentPrice, atr, 2, timeframe);

      // Ejecutar orden
      const results = await this.executor.executeOrder({
        symbol,
        side: 'buy',
        entryPrice: currentPrice,
        quantity: positionSize.quantity,
        stopLoss: levels.stopLoss,
        takeProfit: levels.takeProfit,
        exchange: this.preferredExchange
      });

      if (!results[0].success) {
        console.log(`  ❌ Orden rechazada: ${results[0].message}`);
        return;
      }

      this.state.ordersToday++;

      // Guardar posición en Supabase
      const positionId = await this.tradeLogger.savePosition({
        symbol,
        side: 'buy',
        entryPrice: currentPrice,
        quantity: positionSize.quantity,
        riskAmount: positionSize.riskAmount,
        stopLoss: levels.stopLoss,
        takeProfit: levels.takeProfit,
        timestamp: Date.now()
      });
      if (positionId === null) {
        await this.notifier.notifyError(`Posición en ${symbol} abierta pero NO guardada en la base de datos`);
      }

      // Enviar notificación
      await this.notifier.notifyOrderExecuted(
        symbol,
        'buy',
        currentPrice,
        positionSize.quantity,
        levels.stopLoss,
        levels.takeProfit,
        signalScore.score
      );

      // Registrar la entrada con su proyección para el dashboard
      await this.recordSignal({
        symbol,
        timeframe,
        side: 'buy',
        executed: true,
        candleTime,
        price: currentPrice,
        score: signalScore.score,
        confidence: signalScore.confidence,
        stopLoss: levels.stopLoss,
        takeProfit: levels.takeProfit
      });

    } catch (error) {
      console.error(`Error analizando ${symbol}:`, error);
    }
  }

  /**
   * ¿Hubo un aviso de venta reciente para este símbolo y temporalidad?
   */
  private hasRecentSellSignal(symbol: string, timeframe: '1m' | '5m', candleTime: number): boolean {
    const stepMs = timeframeToMs(timeframe) ?? 60_000;
    const cutoff = candleTime - SELL_SIGNAL_COOLDOWN_CANDLES * stepMs;
    return this.signals.some(
      s => s.side === 'sell' && s.symbol === symbol && s.timeframe === timeframe && new Date(s.time).getTime() > cutoff
    );
  }

  /**
   * Guarda una señal con su proyección de velas. Un fallo en la proyección no afecta a la operación.
   */
  private async recordSignal(input: {
    symbol: string;
    timeframe: '1m' | '5m';
    side: 'buy' | 'sell';
    executed: boolean;
    candleTime: number;
    price: number;
    score: number;
    confidence: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<void> {
    let forecast: Forecast | null = null;
    try {
      forecast = await this.buildSignalForecast(input.symbol, input.timeframe, input.price, input.candleTime);
    } catch (error) {
      console.warn(`  ⚠️ No se pudo calcular la proyección de ${input.symbol}:`, error);
    }

    const { candleTime, ...rest } = input;
    this.signals.push({
      id: randomUUID(),
      ...rest,
      time: new Date(candleTime).toISOString(),
      forecast
    });
    if (this.signals.length > MAX_SIGNALS) {
      this.signals.splice(0, this.signals.length - MAX_SIGNALS);
    }
  }

  /**
   * Proyección por análogos usando solo velas cerradas anteriores a la señal
   */
  private async buildSignalForecast(
    symbol: string,
    timeframe: '1m' | '5m',
    price: number,
    candleTime: number
  ): Promise<Forecast | null> {
    const stepMs = timeframeToMs(timeframe);
    if (!stepMs) return null;

    const data = await this.binanceClient.getOHLCV(symbol, timeframe, FORECAST_HISTORY);
    const history: OHLCV[] = data
      .map(([ts, o, h, l, c, v]: [number, number, number, number, number, number]) => ({
        timestamp: ts,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v
      }))
      .filter((c: OHLCV) => c.timestamp < candleTime);

    return buildForecast(history, { basePrice: price, baseTime: candleTime, stepMs, horizon: 12 });
  }

  /**
   * Señales recientes (más recientes primero), opcionalmente filtradas por símbolo
   */
  getSignals(symbol?: string): TradeSignal[] {
    const list = symbol ? this.signals.filter(s => s.symbol === symbol) : this.signals;
    return [...list].reverse();
  }

  /**
   * Pausa el agente (las posiciones abiertas se siguen vigilando)
   */
  pause(): void {
    this.pauseReason = 'manual';
    this.state.isPaused = true;
    console.log('\n⏸️ Agente pausado');
  }

  /**
   * Reanuda el agente
   */
  resume(): void {
    this.pauseReason = null;
    this.state.isPaused = false;
    console.log('\n▶️ Agente reanudado');
  }

  /**
   * Cierra todas las posiciones. Un fallo en una no impide cerrar las demás.
   */
  async closeAll(): Promise<void> {
    console.log('\n🔄 Cerrando todas las posiciones...');
    const positions = this.riskManager.getOpenPositions();
    let failed = 0;

    for (const position of positions) {
      try {
        const currentPrice = await this.binanceClient.getPrice(position.symbol);
        await this.closeAndRecord(position, currentPrice, 'manual-close');
      } catch (error) {
        failed++;
        console.error(`❌ No se pudo cerrar ${position.symbol}:`, error);
      }
    }

    console.log(`✅ ${positions.length - failed} posiciones cerradas${failed > 0 ? `, ${failed} con error` : ''}`);
    if (failed > 0) {
      throw new Error(`${failed} posiciones no se pudieron cerrar`);
    }
  }

  /**
   * Genera reporte
   */
  async generateReport(): Promise<void> {
    console.log('\n📊 Generando reporte...');

    const stats = this.riskManager.getStats();
    console.log(`\nEstadísticas:`);
    console.log(`  Total de trades: ${stats.totalTrades}`);
    console.log(`  Win rate: ${stats.winRate.toFixed(1)}%`);
    console.log(`  P&L: ${stats.totalPnL >= 0 ? '+' : ''}$${stats.totalPnL.toFixed(2)}`);
    console.log(`  Return: ${stats.returnPercent >= 0 ? '+' : ''}${stats.returnPercent.toFixed(2)}%`);
  }

  /**
   * Obtiene el estado del agente
   */
  getStatus(): AgentState {
    return { ...this.state };
  }

  /**
   * Risk manager que usa realmente el agente (para el dashboard)
   */
  getRiskManager(): RiskManager {
    return this.riskManager;
  }

  /**
   * Cambia los timeframes del agente
   */
  setTimeframes(timeframes: ('1m' | '5m')[]): void {
    this.timeframes = timeframes;
    console.log(`\n⏱️ Temporalidades actualizadas: ${timeframes.join(', ')}`);
  }

  /**
   * Detiene el agente
   */
  stop(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.state.isRunning = false;
    this.notifier.stop();
    console.log('\n🛑 Agente detenido\n');
  }
}

/**
 * Punto de entrada principal
 */
async function main() {
  process.on('unhandledRejection', reason => {
    console.error('❌ Promesa rechazada sin manejar:', reason);
  });

  const agent = new TradingAgent(10000);

  try {
    await agent.start();
  } catch {
    process.exit(1);
  }

  // Manejo de señales de interrupción
  process.once('SIGINT', async () => {
    console.log('\n\n⏹️ Deteniendo agente...');
    // Salida forzada si el cierre se queda colgado
    setTimeout(() => process.exit(1), 15000).unref();
    let exitCode = 0;
    try {
      await agent.closeAll();
    } catch (error) {
      console.error('❌ Error cerrando posiciones:', error);
      exitCode = 1;
    }
    await agent.generateReport();
    agent.stop();
    process.exit(exitCode);
  });
}

// Iniciar si es el archivo principal
if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export default TradingAgent;
