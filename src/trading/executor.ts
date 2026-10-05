import BinanceClient from '../config/binance';
import BybitClient from '../config/bybit';
import { RiskManager, Position } from './risk-manager';

/**
 * Resultado de ejecución de orden
 */
export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  message: string;
  timestamp: number;
  exchange: 'binance' | 'bybit';
}

/**
 * Orden a ejecutar
 */
export interface OrderToExecute {
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  exchange: 'binance' | 'bybit' | 'both'; // 'both' = ejecutar en el que tenga mejor precio
}

/**
 * Ejecutor de órdenes
 * Maneja la ejecución real de trades en exchanges
 */
export class OrderExecutor {
  private binanceClient: BinanceClient;
  private bybitClient: BybitClient;
  private riskManager: RiskManager;
  private executedOrders: ExecutionResult[] = [];

  constructor(riskManager: RiskManager) {
    this.binanceClient = new BinanceClient();
    this.bybitClient = new BybitClient();
    this.riskManager = riskManager;
  }

  /**
   * Valida una orden antes de ejecutarla
   */
  private validateOrder(order: OrderToExecute): { valid: boolean; reason?: string } {
    // Validar cantidad
    if (order.quantity <= 0) {
      return { valid: false, reason: 'Cantidad debe ser mayor a 0' };
    }

    // Validar precios
    if (order.entryPrice <= 0) {
      return { valid: false, reason: 'Precio de entrada debe ser mayor a 0' };
    }

    if (order.side === 'buy') {
      if (order.stopLoss >= order.entryPrice) {
        return { valid: false, reason: 'Stop-loss debe estar por debajo del precio de entrada (compra)' };
      }
      if (order.takeProfit <= order.entryPrice) {
        return { valid: false, reason: 'Take-profit debe estar por encima del precio de entrada (compra)' };
      }
    } else {
      if (order.stopLoss <= order.entryPrice) {
        return { valid: false, reason: 'Stop-loss debe estar por encima del precio de entrada (venta)' };
      }
      if (order.takeProfit >= order.entryPrice) {
        return { valid: false, reason: 'Take-profit debe estar por debajo del precio de entrada (venta)' };
      }
    }

    // Validar ratio R:R mínimo 1:1.5
    const riskAmount = Math.abs(order.entryPrice - order.stopLoss);
    const profitAmount = Math.abs(order.takeProfit - order.entryPrice);
    const ratio = profitAmount / riskAmount;

    if (ratio < 1.48) {
      return { valid: false, reason: `Ratio R:R insuficiente. Mínimo 1:1.5, obtenido 1:${ratio.toFixed(2)}` };
    }

    return { valid: true };
  }

  /**
   * Ejecuta una orden de compra en Binance
   */
  private async executeBinanceBuyOrder(
    symbol: string,
    quantity: number,
    price: number
  ): Promise<ExecutionResult> {
    try {
      const order = await this.binanceClient.createLimitBuyOrder(symbol, quantity, price);

      return {
        success: true,
        orderId: order.id,
        message: `Orden de compra ejecutada en Binance: ${symbol} @ $${price}`,
        timestamp: Date.now(),
        exchange: 'binance'
      };
    } catch (error) {
      return {
        success: false,
        message: `Error en Binance: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        exchange: 'binance'
      };
    }
  }

  /**
   * Ejecuta una orden de venta en Binance
   */
  private async executeBinanceSellOrder(
    symbol: string,
    quantity: number,
    price: number
  ): Promise<ExecutionResult> {
    try {
      const order = await this.binanceClient.createLimitSellOrder(symbol, quantity, price);

      return {
        success: true,
        orderId: order.id,
        message: `Orden de venta ejecutada en Binance: ${symbol} @ $${price}`,
        timestamp: Date.now(),
        exchange: 'binance'
      };
    } catch (error) {
      return {
        success: false,
        message: `Error en Binance: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        exchange: 'binance'
      };
    }
  }

  /**
   * Ejecuta una orden de compra en Bybit
   */
  private async executeBybitBuyOrder(
    symbol: string,
    quantity: number,
    price: number
  ): Promise<ExecutionResult> {
    try {
      const order = await this.bybitClient.createLimitBuyOrder(symbol, quantity, price);

      return {
        success: true,
        orderId: order.id,
        message: `Orden de compra ejecutada en Bybit: ${symbol} @ $${price}`,
        timestamp: Date.now(),
        exchange: 'bybit'
      };
    } catch (error) {
      return {
        success: false,
        message: `Error en Bybit: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        exchange: 'bybit'
      };
    }
  }

  /**
   * Ejecuta una orden de venta en Bybit
   */
  private async executeBybitSellOrder(
    symbol: string,
    quantity: number,
    price: number
  ): Promise<ExecutionResult> {
    try {
      const order = await this.bybitClient.createLimitSellOrder(symbol, quantity, price);

      return {
        success: true,
        orderId: order.id,
        message: `Orden de venta ejecutada en Bybit: ${symbol} @ $${price}`,
        timestamp: Date.now(),
        exchange: 'bybit'
      };
    } catch (error) {
      return {
        success: false,
        message: `Error en Bybit: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        exchange: 'bybit'
      };
    }
  }

  /**
   * Ejecuta una orden completa (entrada + stop-loss + take-profit)
   */
  async executeOrder(order: OrderToExecute): Promise<ExecutionResult[]> {
    console.log('\n' + '═'.repeat(80));
    console.log('🔄 EJECUTANDO ORDEN');
    console.log('═'.repeat(80));

    // Validar orden
    const validation = this.validateOrder(order);
    if (!validation.valid) {
      const result: ExecutionResult = {
        success: false,
        message: `Validación fallida: ${validation.reason}`,
        timestamp: Date.now(),
        exchange: 'binance'
      };
      console.log(`❌ ${result.message}`);
      return [result];
    }

    console.log(`📊 Símbolo: ${order.symbol}`);
    console.log(`📈 Lado: ${order.side.toUpperCase()}`);
    console.log(`💰 Cantidad: ${order.quantity}`);
    console.log(`💵 Precio entrada: $${order.entryPrice.toFixed(2)}`);
    console.log(`🛑 Stop-Loss: $${order.stopLoss.toFixed(2)}`);
    console.log(`📈 Take-Profit: $${order.takeProfit.toFixed(2)}`);

    const results: ExecutionResult[] = [];

    try {
      // SIMULACIÓN LOCAL: No hacer llamadas reales a exchange
      // Solo simular la ejecución usando el RiskManager local
      console.log('\n📊 MODO SIMULACIÓN: Ejecutando localmente sin conectar a exchange');
      console.log(`   Exchange: ${order.exchange} (simulado)`);

      // Simular orden exitosa
      const orderId = `SIM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const entryResult: ExecutionResult = {
        success: true,
        orderId: orderId,
        message: `✅ SIMULACIÓN: Orden ejecutada en ${order.exchange} - ${order.symbol} ${order.side.toUpperCase()} @ $${order.entryPrice.toFixed(2)} (${order.quantity.toFixed(8)} unidades)`,
        timestamp: Date.now(),
        exchange: order.exchange === 'binance' ? 'binance' : order.exchange === 'bybit' ? 'bybit' : 'binance'
      };
      results.push(entryResult);
      console.log(`\n${entryResult.success ? '✅' : '❌'} ${entryResult.message}`);

      if (entryResult.success) {
        // Registrar en risk manager
        const position = this.riskManager.openPosition(
          order.symbol,
          order.side,
          order.entryPrice,
          order.quantity,
          order.stopLoss,
          order.takeProfit
        );

        console.log(`✅ Posición registrada: ${position.id}`);
        console.log(`💰 Riesgo en esta operación: $${position.riskAmount.toFixed(2)}`);

        // TODO: En producción, ejecutar órdenes de stop-loss y take-profit
        // Por ahora, solo se ejecuta la orden de entrada en testnet
      }
    } catch (error) {
      const errorResult: ExecutionResult = {
        success: false,
        message: `Error inesperado: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
        exchange: 'binance'
      };
      results.push(errorResult);
      console.log(`❌ ${errorResult.message}`);
    }

    this.executedOrders.push(...results);
    console.log('═'.repeat(80) + '\n');

    return results;
  }

  /**
   * Obtiene todas las órdenes ejecutadas
   */
  getExecutedOrders(): ExecutionResult[] {
    return [...this.executedOrders];
  }

  /**
   * Obtiene estadísticas de ejecución
   */
  getExecutionStats() {
    const successful = this.executedOrders.filter(o => o.success).length;
    const failed = this.executedOrders.filter(o => !o.success).length;

    return {
      totalOrders: this.executedOrders.length,
      successful,
      failed,
      successRate: this.executedOrders.length > 0 ? (successful / this.executedOrders.length) * 100 : 0
    };
  }
}

export default OrderExecutor;
