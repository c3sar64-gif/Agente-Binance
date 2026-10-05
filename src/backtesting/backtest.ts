/**
 * Motor de Backtesting
 * Simula la estrategia en datos históricos
 */

import { calculateAllIndicators, OHLCV } from '../analysis/indicators';
import { detectMarketRegime } from '../analysis/market-regime';
import { generateSignalScore } from '../analysis/scorer';
import { RiskManager, computePnl } from '../trading/risk-manager';

export interface BacktestTrade {
  symbol: string;
  side: 'buy' | 'sell';
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  duration: number; // minutos
}

export interface BacktestStats {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  returnPercent: number;
  avgPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number; // Ganancias / Pérdidas
  maxDrawdown: number; // Pérdida máxima
  sharpeRatio: number; // Rendimiento ajustado por riesgo
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  trades: BacktestTrade[];
}

export interface BacktestResult {
  startDate: number;
  endDate: number;
  durationDays: number;
  initialCapital: number;
  finalCapital: number;
  symbols: string[];
  stats: { [key: string]: BacktestStats };
  overallStats: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    returnPercent: number;
    sharpeRatio: number;
    maxDrawdown: number;
  };
}

/**
 * Ejecuta un backtest completo
 */
export async function runBacktest(
  symbol: string,
  ohlcvData: OHLCV[],
  initialCapital: number = 10000
): Promise<BacktestStats> {
  const trades: BacktestTrade[] = [];
  const riskManager = new RiskManager(initialCapital);
  let accountBalance = initialCapital;
  let peakBalance = initialCapital;

  // Procesar cada vela
  for (let i = 100; i < ohlcvData.length; i++) {
    const currentBar = ohlcvData[i];
    const recentOHLCV = ohlcvData.slice(Math.max(0, i - 200), i + 1);

    try {
      // Calcular indicadores
      const indicators = calculateAllIndicators(recentOHLCV);
      const regime = detectMarketRegime(recentOHLCV);

      // Generar señal
      // Sin sentimiento: serían noticias de hoy aplicadas a velas pasadas (y una llamada HTTP por vela)
      const signalScore = await generateSignalScore(indicators, recentOHLCV, regime, symbol, '1h', false);

      // Verificar si hay posición abierta
      const openPositions = riskManager.getOpenPositions();
      const hasOpenPosition = openPositions.some(p => p.symbol === symbol);

      // ENTRADA
      const atr = indicators.atr;
      if (!hasOpenPosition && atr !== null && atr > 0 && signalScore.score >= 6.5 && signalScore.confidence >= 65) {
        const volatility = atr;
        const positionSize = riskManager.calculatePositionSize(
          currentBar.close,
          volatility,
          signalScore.score // Escala 1-10, igual que en el agente en vivo
        );

        if (positionSize.isValid) {
          // Calcular niveles
          const riskPercent = volatility / currentBar.close;
          const stopLoss = signalScore.type === 'buy'
            ? currentBar.close * (1 - riskPercent * 2)
            : currentBar.close * (1 + riskPercent * 2);

          const takeProfit = signalScore.type === 'buy'
            ? currentBar.close * (1 + riskPercent * 3)
            : currentBar.close * (1 - riskPercent * 3);

          // Abrir posición
          riskManager.openPosition(
            symbol,
            signalScore.type === 'buy' ? 'buy' : 'sell',
            currentBar.close,
            positionSize.quantity,
            stopLoss,
            takeProfit
          );
        }
      }

      // SALIDA
      if (hasOpenPosition) {
        const position = openPositions.find(p => p.symbol === symbol);
        if (position) {
          let shouldClose = false;
          let exitPrice = currentBar.close;
          let exitReason = '';

          const hitStop = position.side === 'buy'
            ? currentBar.low <= position.stopLoss
            : currentBar.high >= position.stopLoss;
          const hitTarget = position.side === 'buy'
            ? currentBar.high >= position.takeProfit
            : currentBar.low <= position.takeProfit;

          // Si la vela toca SL y TP, asumir SL primero (conservador: no se sabe el orden intravela)
          if (hitStop) {
            shouldClose = true;
            exitPrice = position.stopLoss;
            exitReason = 'stop-loss';
          } else if (hitTarget) {
            shouldClose = true;
            exitPrice = position.takeProfit;
            exitReason = 'take-profit';
          }

          if (shouldClose) {
            const pnl = computePnl(position.side, position.entryPrice, exitPrice, position.quantity);
            const pnlPercent = (pnl / (position.entryPrice * position.quantity)) * 100;
            const duration = currentBar.timestamp - position.timestamp; // en ms

            trades.push({
              symbol,
              side: position.side,
              entryTime: position.timestamp,
              entryPrice: position.entryPrice,
              exitTime: currentBar.timestamp,
              exitPrice,
              quantity: position.quantity,
              pnl,
              pnlPercent,
              duration: duration / (60 * 1000) // convertir a minutos
            });

            // Actualizar balance
            accountBalance += pnl;
            peakBalance = Math.max(peakBalance, accountBalance);

            // Cerrar posición
            riskManager.closePosition(position.id, exitPrice, exitReason);
          }
        }
      }
    } catch (error) {
      console.error(`Error en backtesting barra ${i}:`, error);
    }
  }

  // Calcular estadísticas
  return calculateStats(symbol, trades, initialCapital, accountBalance);
}

/**
 * Calcula estadísticas del backtest
 */
function calculateStats(
  symbol: string,
  trades: BacktestTrade[],
  initialCapital: number,
  finalCapital: number
): BacktestStats {
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const returnPercent = ((finalCapital - initialCapital) / initialCapital) * 100;

  // Profit Factor
  const totalGains = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? 999 : 0;

  // Max Drawdown
  let maxDrawdown = 0;
  let peakBalance = initialCapital;
  let balance = initialCapital;
  for (const trade of trades) {
    balance += trade.pnl;
    peakBalance = Math.max(peakBalance, balance);
    const drawdown = ((peakBalance - balance) / peakBalance) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }

  // Sharpe Ratio
  const returns = trades.map(t => (t.pnl / initialCapital) * 100);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b) / returns.length : 0;
  const variance = returns.length > 0
    ? returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Anualizado

  // Rachas
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;

  for (const trade of trades) {
    if (trade.pnl > 0) {
      currentWins++;
      currentLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
    } else {
      currentLosses++;
      currentWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
    }
  }

  return {
    symbol,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
    totalPnL,
    returnPercent,
    avgPnL: trades.length > 0 ? totalPnL / trades.length : 0,
    avgWin: winningTrades.length > 0 ? totalGains / winningTrades.length : 0,
    avgLoss: losingTrades.length > 0 ? -totalLosses / losingTrades.length : 0,
    profitFactor,
    maxDrawdown,
    sharpeRatio,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    trades
  };
}

/**
 * Formatea resultado para mostrar
 */
export function formatBacktestResult(stats: BacktestStats): string {
  return `
📊 BACKTEST RESULTS: ${stats.symbol}
${'-'.repeat(50)}
Total Trades:        ${stats.totalTrades}
Winning:             ${stats.winningTrades} (${stats.winRate.toFixed(1)}%)
Losing:              ${stats.losingTrades}

💰 Performance:
Total P&L:           $${stats.totalPnL.toFixed(2)}
Return:              ${stats.returnPercent.toFixed(2)}%
Avg P&L per Trade:   $${stats.avgPnL.toFixed(2)}
Avg Win:             $${stats.avgWin.toFixed(2)}
Avg Loss:            $${stats.avgLoss.toFixed(2)}

📈 Risk Metrics:
Profit Factor:       ${stats.profitFactor.toFixed(2)} (1 = break-even, 2 = excellent)
Max Drawdown:        ${stats.maxDrawdown.toFixed(2)}%
Sharpe Ratio:        ${stats.sharpeRatio.toFixed(2)} (>1 = good, >2 = excellent)

🏆 Streaks:
Max Consecutive Wins: ${stats.maxConsecutiveWins}
Max Consecutive Losses: ${stats.maxConsecutiveLosses}
${'-'.repeat(50)}
  `;
}
