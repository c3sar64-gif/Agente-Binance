import ccxt from 'ccxt';
import { getEnvConfig } from './env';

/**
 * Cliente de Bybit Demo
 * Usa CCXT para una conexión unificada
 */
export class BybitClient {
  private exchange: any;
  private config: ReturnType<typeof getEnvConfig>;

  constructor() {
    this.config = getEnvConfig();

    this.exchange = new (ccxt as any).bybit({
      apiKey: this.config.bybitApiKey,
      secret: this.config.bybitApiSecret,
      enableRateLimit: true,
      timeout: 10000
    });

    // Nunca mainnet: testnet si BYBIT_TESTNET=true, si no Demo Trading (api-demo.bybit.com)
    if (this.config.bybitTestnet) {
      this.exchange.setSandboxMode(true);
    } else {
      this.exchange.enableDemoTrading(true);
    }
  }

  /**
   * Test de conexión
   */
  async testConnection(): Promise<boolean> {
    try {
      // Si no hay credenciales, retornar false
      if (!this.config.bybitApiKey || !this.config.bybitApiSecret) {
        console.log('⚠️  Bybit Demo: credenciales no configuradas');
        return false;
      }

      const ticker = await this.exchange.fetchTicker('BTC/USDT');
      console.log('✅ Bybit Demo conectado');
      console.log(`   BTC: $${ticker.last}`);
      return true;
    } catch (error) {
      console.error('⚠️  Error conectando a Bybit:', error);
      return false;
    }
  }

  /**
   * Obtener balance de cuenta
   */
  async getBalance() {
    try {
      const balance = await this.exchange.fetchBalance();
      return balance;
    } catch (error) {
      console.error('Error obteniendo balance:', error);
      throw error;
    }
  }

  /**
   * Obtener datos OHLCV (velas)
   */
  async getOHLCV(
    symbol: string,
    timeframe: string = '1h',
    limit: number = 100
  ) {
    try {
      const ohlcv = await this.exchange.fetchOHLCV(symbol, timeframe, undefined, limit);
      return ohlcv;
    } catch (error) {
      console.error(`Error obteniendo OHLCV para ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Obtener el precio actual de un símbolo
   */
  async getPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return ticker.last!;
    } catch (error) {
      console.error(`Error obteniendo precio de ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Colocar orden de compra LIMIT
   */
  async createLimitBuyOrder(
    symbol: string,
    amount: number,
    price: number
  ) {
    try {
      const order = await this.exchange.createLimitBuyOrder(symbol, amount, price);
      console.log(`✅ Orden de compra creada en Bybit: ${symbol} @ ${price}`);
      return order;
    } catch (error) {
      console.error('Error creando orden de compra:', error);
      throw error;
    }
  }

  /**
   * Colocar orden de venta LIMIT
   */
  async createLimitSellOrder(
    symbol: string,
    amount: number,
    price: number
  ) {
    try {
      const order = await this.exchange.createLimitSellOrder(symbol, amount, price);
      console.log(`✅ Orden de venta creada en Bybit: ${symbol} @ ${price}`);
      return order;
    } catch (error) {
      console.error('Error creando orden de venta:', error);
      throw error;
    }
  }

  /**
   * Cancelar una orden
   */
  async cancelOrder(orderId: string, symbol: string) {
    try {
      const result = await this.exchange.cancelOrder(orderId, symbol);
      console.log(`✅ Orden cancelada: ${orderId}`);
      return result;
    } catch (error) {
      console.error('Error cancelando orden:', error);
      throw error;
    }
  }

  /**
   * Obtener estado de una orden
   */
  async getOrder(orderId: string, symbol: string) {
    try {
      const order = await this.exchange.fetchOrder(orderId, symbol);
      return order;
    } catch (error) {
      console.error('Error obteniendo orden:', error);
      throw error;
    }
  }

  /**
   * Obtener los símbolos disponibles
   */
  async getSymbols(): Promise<string[]> {
    try {
      if (!this.exchange.symbols) {
        await this.exchange.loadMarkets();
      }
      return this.exchange.symbols || [];
    } catch (error) {
      console.error('Error obteniendo símbolos:', error);
      throw error;
    }
  }

  /**
   * Obtener la información de la moneda (límites, precisión, etc.)
   */
  async getMarket(symbol: string) {
    try {
      if (!this.exchange.markets || Object.keys(this.exchange.markets).length === 0) {
        await this.exchange.loadMarkets();
      }
      return this.exchange.market(symbol);
    } catch (error) {
      console.error(`Error obteniendo mercado ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Obtener el volumen de un símbolo
   */
  async getVolume(symbol: string): Promise<number> {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return ticker.quoteVolume || 0;
    } catch (error) {
      console.error(`Error obteniendo volumen de ${symbol}:`, error);
      throw error;
    }
  }
}

export default BybitClient;
