import ccxt from 'ccxt';
import { getEnvConfig } from './env';

/**
 * Cliente de Binance Testnet
 * Usa CCXT para una conexión unificada
 */
export class BinanceClient {
  private exchange: any;
  private config: ReturnType<typeof getEnvConfig>;

  constructor() {
    this.config = getEnvConfig();

    this.exchange = new (ccxt as any).binance({
      apiKey: this.config.binanceApiKey,
      secret: this.config.binanceApiSecret,
      testnet: true, // Forzar testnet
      enableRateLimit: true,
      timeout: 10000,
      urls: {
        api: {
          public: 'https://testnet.binance.vision/api',
          private: 'https://testnet.binance.vision/api',
          v3: 'https://testnet.binance.vision/api/v3',
        }
      }
    });
  }

  /**
   * Test de conexión
   */
  async testConnection(): Promise<boolean> {
    try {
      const ticker = await this.exchange.fetchTicker('BTC/USDT');
      console.log('✅ Binance Testnet conectado');
      console.log(`   BTC: $${ticker.last}`);
      return true;
    } catch (error) {
      console.error('❌ Error conectando a Binance:', error);
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
      if (typeof ticker.last !== 'number' || !Number.isFinite(ticker.last)) {
        throw new Error(`Precio inválido recibido para ${symbol}`);
      }
      return ticker.last;
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
      console.log(`✅ Orden de compra creada: ${symbol} @ ${price}`);
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
      console.log(`✅ Orden de venta creada: ${symbol} @ ${price}`);
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

export default BinanceClient;
