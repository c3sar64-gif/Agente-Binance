/**
 * Gestor de riesgo del agente
 * Calcula tamaño de posición, stop-loss, take-profit
 * Valida límites de riesgo diarios y semanales
 */

import { randomUUID } from 'crypto';

/**
 * Stop-loss máximo permitido (%) para evitar niveles absurdos si el ATR es anómalo
 */
const MAX_STOP_LOSS_PERCENT = 10;

/**
 * Calcula el P&L de una operación teniendo en cuenta el lado (long/short)
 */
export function computePnl(
  side: 'buy' | 'sell',
  entryPrice: number,
  exitPrice: number,
  quantity: number
): number {
  const direction = side === 'buy' ? 1 : -1;
  return direction * (exitPrice - entryPrice) * quantity;
}

/**
 * Inicio de la semana (lunes 00:00 local) para el reset semanal
 */
function startOfWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

/**
 * Parámetros de una posición
 */
export interface Position {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  quantity: number;
  riskAmount: number;
  stopLoss: number;
  takeProfit: number;
  timestamp: number;
  status: 'open' | 'closed' | 'pending';
  exitPrice?: number;
  exitReason?: string;
}

/**
 * Estado del capital y riesgo
 */
export interface RiskState {
  totalCapital: number;
  availableCapital: number;
  usedCapital: number;
  openPositions: number;
  dailyLoss: number;
  weeklyLoss: number;
  maxRiskPerTrade: number; // 3% del capital
  maxDailyLoss: number; // 9% del capital
  maxWeeklyLoss: number; // 15% del capital
}

/**
 * Cálculo de tamaño de posición
 */
export interface PositionSize {
  quantity: number;
  riskAmount: number;
  potentialProfit: number;
  riskRewardRatio: number;
  isValid: boolean;
  reason?: string;
}

/**
 * Clase para gestionar riesgo
 */
export class RiskManager {
  private totalCapital: number;
  private openPositions: Position[] = [];
  private closedPositions: Position[] = [];
  private dailyLoss: number = 0;
  private weeklyLoss: number = 0;
  private lastDailyReset: Date;
  private lastWeeklyReset: Date;

  constructor(initialCapital: number) {
    this.totalCapital = initialCapital;
    this.lastDailyReset = new Date();
    this.lastWeeklyReset = new Date();
  }

  /**
   * Obtener estado actual del riesgo
   */
  getState(): RiskState {
    this.rollPeriods();

    // Capital comprometido = nocional de las posiciones abiertas (spot, sin apalancamiento)
    const usedCapital = this.openPositions.reduce((sum, pos) => sum + pos.entryPrice * pos.quantity, 0);
    const availableCapital = this.totalCapital - usedCapital;

    return {
      totalCapital: this.totalCapital,
      availableCapital,
      usedCapital,
      openPositions: this.openPositions.length,
      dailyLoss: this.dailyLoss,
      weeklyLoss: this.weeklyLoss,
      maxRiskPerTrade: this.totalCapital * 0.03, // 3%
      maxDailyLoss: this.totalCapital * 0.09, // 9%
      maxWeeklyLoss: this.totalCapital * 0.15 // 15%
    };
  }

  /**
   * Calcula el tamaño óptimo de posición usando Kelly modificado
   * Entrada: precio, volatilidad, confianza de señal
   * Salida: cantidad a comprar, stop-loss, take-profit
   */
  calculatePositionSize(
    entryPrice: number,
    volatility: number, // ATR o porcentaje
    signalConfidence: number, // 1-10
    riskRewardRatio: number = 2, // 1:2 mínimo
    positionMultiplier: number = 1, // 0-1, reduce por régimen volátil
    timeframe: '1m' | '5m' | '1h' = '1h'
  ): PositionSize {
    const state = this.getState();
    const maxRiskPerTrade = state.maxRiskPerTrade;

    if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(volatility) || volatility <= 0) {
      return {
        quantity: 0,
        riskAmount: 0,
        potentialProfit: 0,
        riskRewardRatio: 0,
        isValid: false,
        reason: 'Precio o volatilidad inválidos'
      };
    }

    // Validar límites
    if (state.openPositions >= 5) {
      return {
        quantity: 0,
        riskAmount: 0,
        potentialProfit: 0,
        riskRewardRatio: 0,
        isValid: false,
        reason: 'Máximo de 5 posiciones abiertas alcanzado'
      };
    }

    if (state.dailyLoss >= state.maxDailyLoss) {
      return {
        quantity: 0,
        riskAmount: 0,
        potentialProfit: 0,
        riskRewardRatio: 0,
        isValid: false,
        reason: 'Límite de pérdida diaria alcanzado (9%)'
      };
    }

    if (state.weeklyLoss >= state.maxWeeklyLoss) {
      return {
        quantity: 0,
        riskAmount: 0,
        potentialProfit: 0,
        riskRewardRatio: 0,
        isValid: false,
        reason: 'Límite de pérdida semanal alcanzado (15%)'
      };
    }

    // Usar los mismos niveles que se colocarán realmente, para que el riesgo calculado sea el real
    const levels = this.calculateLevels(entryPrice, volatility, riskRewardRatio, timeframe);
    const stopLossPercent = levels.stopLossPercent;
    const takeProfitPercent = levels.takeProfitPercent;
    const stopLossPrice = levels.stopLoss;
    const takeProfitPrice = levels.takeProfit;

    // Para testnet con capital limitado, usar fracción del capital disponible
    // en lugar de riesgo absoluto
    const maxPositionCapitalPercent = 0.025; // Max 2.5% del capital por posición
    let maxPositionCapital = state.totalCapital * maxPositionCapitalPercent;

    // Ajustar por confianza (weaker signals get smaller positions)
    const confidenceMultiplier = Math.min(signalConfidence / 10, 1);
    maxPositionCapital *= confidenceMultiplier;

    // Ajustar por régimen de mercado
    maxPositionCapital *= positionMultiplier;

    // Usar el menor de: posición por capital vs posición por riesgo
    let riskAmount = Math.min(maxRiskPerTrade * confidenceMultiplier * positionMultiplier, maxPositionCapital);

    // Calcular cantidad
    const riskPerUnit = entryPrice - stopLossPrice;
    const quantity = riskAmount / riskPerUnit;

    // Validar que haya capital suficiente
    const requiredCapital = quantity * entryPrice;
    if (requiredCapital > state.availableCapital) {
      // Si el capital no es suficiente, usar la máxima cantidad posible con capital disponible
      const adjustedQuantity = Math.floor((state.availableCapital * 0.8 / entryPrice) * 100000) / 100000;
      if (adjustedQuantity <= 0) {
        return {
          quantity: 0,
          riskAmount: 0,
          potentialProfit: 0,
          riskRewardRatio,
          isValid: false,
          reason: `Capital insuficiente. Necesario: $${requiredCapital.toFixed(2)}, Disponible: $${state.availableCapital.toFixed(2)}`
        };
      }
      const adjustedRiskAmount = adjustedQuantity * riskPerUnit;
      const adjustedProfit = adjustedQuantity * (takeProfitPrice - entryPrice);
      return {
        quantity: adjustedQuantity,
        riskAmount: adjustedRiskAmount,
        potentialProfit: adjustedProfit,
        riskRewardRatio,
        isValid: true
      };
    }

    const potentialProfit = quantity * (takeProfitPrice - entryPrice);

    return {
      quantity: Math.floor(quantity * 100000) / 100000, // Redondear a 5 decimales
      riskAmount: riskAmount,
      potentialProfit: potentialProfit,
      riskRewardRatio: riskRewardRatio,
      isValid: true,
      reason: `${(stopLossPercent).toFixed(2)}% SL | ${(takeProfitPercent).toFixed(2)}% TP`
    };
  }

  /**
   * Calcula niveles de stop-loss y take-profit
   * Ajustado para diferentes timeframes
   */
  calculateLevels(
    entryPrice: number,
    volatility: number,
    riskRewardRatio: number = 2,
    timeframe: '1m' | '5m' | '1h' = '1h'
  ) {
    const volatilityPercent = (volatility / entryPrice) * 100;

    // SL más apretado en timeframes bajos (menos volatilidad esperada)
    let stopLossPercent: number;
    if (timeframe === '1m') {
      stopLossPercent = Math.max(volatilityPercent * 0.8, 0.5); // 0.5% mínimo
    } else if (timeframe === '5m') {
      stopLossPercent = Math.max(volatilityPercent * 1.0, 0.75); // 0.75% mínimo
    } else {
      stopLossPercent = Math.max(volatilityPercent * 1.5, 1); // 1% mínimo (default)
    }
    stopLossPercent = Math.min(stopLossPercent, MAX_STOP_LOSS_PERCENT);

    // TP más agresivo en timeframes bajos (movimientos pequeños con más frecuencia)
    let riskRewardForTP = riskRewardRatio;
    if (timeframe === '1m') {
      riskRewardForTP = 1.5; // 1:1.5 en 1m
    } else if (timeframe === '5m') {
      riskRewardForTP = 1.8; // 1:1.8 en 5m
    }

    const stopLossPrice = entryPrice * (1 - stopLossPercent / 100);
    const takeProfitPrice = entryPrice * (1 + stopLossPercent * riskRewardForTP / 100);

    return {
      stopLoss: stopLossPrice,
      takeProfit: takeProfitPrice,
      stopLossPercent: stopLossPercent,
      takeProfitPercent: stopLossPercent * riskRewardForTP
    };
  }

  /**
   * Abre una posición
   */
  openPosition(
    symbol: string,
    side: 'buy' | 'sell',
    entryPrice: number,
    quantity: number,
    stopLoss: number,
    takeProfit: number
  ): Position {
    const riskAmount = Math.abs(entryPrice - stopLoss) * quantity;

    const position: Position = {
      id: `${symbol}-${randomUUID()}`,
      symbol,
      side,
      entryPrice,
      quantity,
      riskAmount,
      stopLoss,
      takeProfit,
      timestamp: Date.now(),
      status: 'open'
    };

    this.openPositions.push(position);
    return position;
  }

  /**
   * Cierra una posición
   */
  closePosition(positionId: string, exitPrice: number, reason: string = 'manual'): Position | null {
    const index = this.openPositions.findIndex(p => p.id === positionId);
    if (index === -1) return null;

    const position = this.openPositions[index];
    const pnl = computePnl(position.side, position.entryPrice, exitPrice, position.quantity);

    // Registrar pérdida/ganancia en contadores diarios
    this.rollPeriods();
    if (pnl < 0) {
      this.dailyLoss += Math.abs(pnl);
      this.weeklyLoss += Math.abs(pnl);
    }

    position.status = 'closed';
    position.exitPrice = exitPrice;
    position.exitReason = reason;

    this.openPositions.splice(index, 1);
    this.closedPositions.push(position);

    return position;
  }

  /**
   * Obtiene todas las posiciones abiertas
   */
  getOpenPositions(): Position[] {
    return [...this.openPositions];
  }

  /**
   * Obtiene las posiciones cerradas
   */
  getClosedPositions(): Position[] {
    return [...this.closedPositions];
  }

  /**
   * Verifica si se debe pausar por límite diario
   */
  shouldPauseDailyLoss(): boolean {
    const state = this.getState();
    return state.dailyLoss >= state.maxDailyLoss;
  }

  /**
   * Verifica si se debe pausar por límite semanal
   */
  shouldPauseWeeklyLoss(): boolean {
    const state = this.getState();
    return state.weeklyLoss >= state.maxWeeklyLoss;
  }

  /**
   * Resetea automáticamente los contadores al cambiar de día o de semana
   */
  private rollPeriods(now: Date = new Date()): void {
    if (now.toDateString() !== this.lastDailyReset.toDateString()) {
      this.resetDaily();
    }
    if (startOfWeek(now) !== startOfWeek(this.lastWeeklyReset)) {
      this.resetWeekly();
    }
  }

  /**
   * Reset diario
   */
  resetDaily(): void {
    this.dailyLoss = 0;
    this.lastDailyReset = new Date();
  }

  /**
   * Reset semanal
   */
  resetWeekly(): void {
    this.weeklyLoss = 0;
    this.lastWeeklyReset = new Date();
  }

  /**
   * Calcula la ganancia/pérdida total
   */
  calculateTotalPnL(): number {
    let totalPnL = 0;

    // PnL de posiciones cerradas
    for (const pos of this.closedPositions) {
      if (pos.exitPrice) {
        totalPnL += computePnl(pos.side, pos.entryPrice, pos.exitPrice, pos.quantity);
      }
    }

    return totalPnL;
  }

  /**
   * Calcula el porcentaje de ganancia
   */
  calculateReturnPercent(): number {
    const totalPnL = this.calculateTotalPnL();
    return (totalPnL / this.totalCapital) * 100;
  }

  /**
   * Obtiene estadísticas de trading
   */
  getStats() {
    const closed = this.closedPositions.length;
    const winners = this.closedPositions.filter(p => {
      if (!p.exitPrice) return false;
      return (p.exitPrice - p.entryPrice) * (p.side === 'buy' ? 1 : -1) > 0;
    }).length;

    const totalPnL = this.calculateTotalPnL();
    const returnPercent = this.calculateReturnPercent();

    return {
      totalTrades: closed,
      winningTrades: winners,
      losingTrades: closed - winners,
      winRate: closed > 0 ? (winners / closed) * 100 : 0,
      totalPnL,
      returnPercent,
      openPositions: this.openPositions.length,
      averageWin: 0, // Se puede calcular después
      averageLoss: 0 // Se puede calcular después
    };
  }
}

export default RiskManager;
