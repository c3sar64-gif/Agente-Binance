declare module 'ccxt' {
  export interface Exchange {
    apiKey: string;
    secret: string;
    testnet: boolean;
    enableRateLimit: boolean;
    timeout: number;
  }

  export interface Binance extends Exchange {
    loadMarkets(): Promise<void>;
    fetchOHLCV(symbol: string, timeframe: string, limit?: number): Promise<any[]>;
    fetchTicker(symbol: string): Promise<any>;
    createLimitBuyOrder(symbol: string, amount: number, price: number): Promise<any>;
    createLimitSellOrder(symbol: string, amount: number, price: number): Promise<any>;
    fetchBalance(): Promise<any>;
  }

  export interface Bybit extends Exchange {
    loadMarkets(): Promise<void>;
    fetchOHLCV(symbol: string, timeframe: string, limit?: number): Promise<any[]>;
    fetchTicker(symbol: string): Promise<any>;
    createLimitBuyOrder(symbol: string, amount: number, price: number): Promise<any>;
    createLimitSellOrder(symbol: string, amount: number, price: number): Promise<any>;
    fetchBalance(): Promise<any>;
  }

  export class binance implements Binance {
    apiKey: string;
    secret: string;
    testnet: boolean;
    enableRateLimit: boolean;
    timeout: number;

    constructor(config: Partial<Binance>);
    loadMarkets(): Promise<void>;
    fetchOHLCV(symbol: string, timeframe: string, limit?: number): Promise<any[]>;
    fetchTicker(symbol: string): Promise<any>;
    createLimitBuyOrder(symbol: string, amount: number, price: number): Promise<any>;
    createLimitSellOrder(symbol: string, amount: number, price: number): Promise<any>;
    fetchBalance(): Promise<any>;
  }

  export class bybit implements Bybit {
    apiKey: string;
    secret: string;
    testnet: boolean;
    enableRateLimit: boolean;
    timeout: number;

    constructor(config: Partial<Bybit>);
    loadMarkets(): Promise<void>;
    fetchOHLCV(symbol: string, timeframe: string, limit?: number): Promise<any[]>;
    fetchTicker(symbol: string): Promise<any>;
    createLimitBuyOrder(symbol: string, amount: number, price: number): Promise<any>;
    createLimitSellOrder(symbol: string, amount: number, price: number): Promise<any>;
    fetchBalance(): Promise<any>;
  }

  const ccxt: {
    binance: typeof binance;
    bybit: typeof bybit;
  };

  export default ccxt;
}
