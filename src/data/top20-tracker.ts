import axios from 'axios';

/**
 * Rastreador del top 20 de criptomonedas
 * Obtiene dinámicamente los activos más grandes para monitorear
 */

export interface CryptoInfo {
  symbol: string;
  name: string;
  marketCap: number;
  rank: number;
}

/**
 * Obtiene el top 20 de criptomonedas desde CoinGecko
 */
export async function getTop20Cryptos(): Promise<string[]> {
  try {
    console.log('📊 Obteniendo top 20 de CoinGecko...');

    const response = await axios.get('https://api.coingecko.com/api/v3/coins/markets', {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 20,
        page: 1,
        sparkline: false
      },
      timeout: 10000
    });

    const symbols: string[] = [];

    for (const coin of response.data) {
      const symbol = coin.symbol.toUpperCase();

      // Excluir stablecoins
      if (['USDT', 'USDC', 'BUSD', 'DAI', 'USDP'].includes(symbol)) {
        continue;
      }

      // Agregar símbolo de Binance
      symbols.push(`${symbol}/USDT`);
    }

    console.log(`✅ Top 20 obtenido: ${symbols.join(', ')}`);
    return symbols;

  } catch (error) {
    console.error('Error obteniendo top 20:', error);
    // Retornar lista por defecto si falla
    return [
      'BTC/USDT',
      'ETH/USDT',
      'BNB/USDT',
      'SOL/USDT',
      'ADA/USDT',
      'XRP/USDT',
      'DOGE/USDT',
      'AVAX/USDT',
      'SHIB/USDT',
      'MATIC/USDT'
    ];
  }
}

/**
 * Filtra monedas según criterios
 */
export function filterCryptos(
  symbols: string[],
  minMarketCap: number = 1000000000, // $1B mínimo
  minAge: number = 90 // 90 días mínimo
): string[] {
  // Por ahora solo retornamos la lista
  // En producción aquí validarías mercap y antigüedad
  return symbols;
}

export default {
  getTop20Cryptos,
  filterCryptos
};
