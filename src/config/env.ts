import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface EnvConfig {
  // Binance
  binanceApiKey: string;
  binanceApiSecret: string;
  binanceTestnet: boolean;
  binanceBaseUrl: string;

  // Bybit
  bybitApiKey: string;
  bybitApiSecret: string;
  bybitTestnet: boolean;

  // Telegram
  telegramBotToken: string;
  telegramAllowedUserIds: number[];

  // News
  newsApiKey: string;

  // Database
  dbPath: string;

  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Valida y retorna la configuración del entorno
 */
export function getEnvConfig(): EnvConfig {
  const requiredVars = [
    'BINANCE_API_KEY',
    'BINANCE_API_SECRET',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_ALLOWED_USER_IDS'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Variables de entorno faltantes: ${missing.join(', ')}`);
  }

  const telegramUserIds = process.env.TELEGRAM_ALLOWED_USER_IDS!
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => Number.isFinite(id));

  if (telegramUserIds.length === 0) {
    throw new Error('TELEGRAM_ALLOWED_USER_IDS no contiene ningún ID numérico válido');
  }

  return {
    // Binance
    binanceApiKey: process.env.BINANCE_API_KEY!,
    binanceApiSecret: process.env.BINANCE_API_SECRET!,
    binanceTestnet: process.env.BINANCE_TESTNET === 'true',
    binanceBaseUrl: process.env.BINANCE_BASE_URL || 'https://testnet.binance.vision',

    // Bybit
    bybitApiKey: process.env.BYBIT_API_KEY || '',
    bybitApiSecret: process.env.BYBIT_API_SECRET || '',
    bybitTestnet: process.env.BYBIT_TESTNET === 'true',

    // Telegram
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
    telegramAllowedUserIds: telegramUserIds,

    // News
    newsApiKey: process.env.NEWS_API_KEY || '',

    // Database
    dbPath: process.env.DB_PATH || './trading.db',

    // Logging
    logLevel: (process.env.LOG_LEVEL as any) || 'info'
  };
}

export default getEnvConfig();
