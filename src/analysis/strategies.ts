import { OHLCV, calculateSMA } from './indicators';

/**
 * ESTRATEGIA 1: MEAN REVERSION
 * Compra cuando precio cae debajo de la media móvil
 * Vende cuando precio sube por encima
 * Mejor en mercados laterales
 */
export function analyzeMeanReversion(ohlcv: OHLCV[], currentPrice: number): number {
  const closes = ohlcv.map(c => c.close);

  const sma50 = calculateSMA(closes, 50);
  const sma200 = calculateSMA(closes, 200);

  if (!sma50 || !sma200) return 0;

  let score = 0;

  // Compra si precio está 2% abajo de SMA50
  if (currentPrice < sma50 * 0.98) {
    score += 1.5; // Señal de compra por reversión
  } else if (currentPrice < sma50) {
    score += 0.5;
  }

  // Venta si precio está 2% arriba de SMA50
  if (currentPrice > sma50 * 1.02) {
    score -= 1.5; // Señal de venta por reversión
  } else if (currentPrice > sma50) {
    score -= 0.5;
  }

  // Fortalecer si precio está cruzando SMA200 (tendencia principal)
  if (currentPrice > sma200 && currentPrice < sma50) {
    score += 0.5; // Compra en tendencia alcista
  }

  return score;
}

/**
 * ESTRATEGIA 2: TREND FOLLOWING (ADX)
 * Sigue tendencias fuertes (ADX > 25)
 * Evita mercados laterales (ADX < 25)
 */
export function analyzeTrendFollowing(
  adx: number | null,
  currentPrice: number,
  ema200: number | null,
  ema50: number | null
): number {
  if (!adx || !ema200 || !ema50) return 0;

  let score = 0;

  // Si ADX < 20 = mercado lateral, no operar
  if (adx < 20) return 0;

  // Tendencia alcista: precio > EMA200 + ADX fuerte
  if (currentPrice > ema200 && adx > 25) {
    score += 2; // Señal fuerte de compra

    // Aumentar si también está arriba de EMA50
    if (currentPrice > ema50) {
      score += 0.5;
    }
  }

  // Tendencia bajista: precio < EMA200 + ADX fuerte
  if (currentPrice < ema200 && adx > 25) {
    score -= 2; // Señal fuerte de venta

    // Aumentar si también está abajo de EMA50
    if (currentPrice < ema50) {
      score -= 0.5;
    }
  }

  // ADX medio (20-25) = tendencia débil
  if (adx >= 20 && adx <= 25) {
    if (currentPrice > ema200) score += 1;
    if (currentPrice < ema200) score -= 1;
  }

  return score;
}

/**
 * ESTRATEGIA 3: FIBONACCI RETRACEMENT
 * Detecta niveles de soporte/resistencia usando Fibonacci
 * Niveles: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%
 */
export function analyzeFibonacci(ohlcv: OHLCV[], currentPrice: number): number {
  if (ohlcv.length < 20) return 0;

  // Encontrar máximo y mínimo recientes (últimas 50 velas)
  const recentData = ohlcv.slice(-50);
  const prices = recentData.map(c => c.close);

  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);

  if (maxPrice === minPrice) return 0;

  const range = maxPrice - minPrice;

  // Calcular niveles de Fibonacci
  const fib = {
    level_0: minPrice,
    level_236: minPrice + range * 0.236,
    level_382: minPrice + range * 0.382,
    level_500: minPrice + range * 0.500,
    level_618: minPrice + range * 0.618,
    level_786: minPrice + range * 0.786,
    level_100: maxPrice
  };

  let score = 0;

  // Si precio toca nivel 38.2% (soporte fuerte) → compra
  if (Math.abs(currentPrice - fib.level_382) / currentPrice < 0.01) {
    score += 1.5; // Muy cerca del nivel 38.2%
  } else if (currentPrice > fib.level_382 && currentPrice < fib.level_500) {
    score += 0.5; // En zona de soporte
  }

  // Si precio toca nivel 61.8% (resistencia fuerte) → venta
  if (Math.abs(currentPrice - fib.level_618) / currentPrice < 0.01) {
    score -= 1.5; // Muy cerca del nivel 61.8%
  } else if (currentPrice > fib.level_500 && currentPrice < fib.level_618) {
    score -= 0.5; // En zona de resistencia
  }

  // Si precio está por debajo del nivel 50 (zona baja)
  if (currentPrice < fib.level_500) {
    // Potencial de compra
    if (currentPrice < fib.level_382) {
      score += 0.3; // Zona de compra
    }
  }

  // Si precio está por encima del nivel 50 (zona alta)
  if (currentPrice > fib.level_500) {
    // Potencial de venta
    if (currentPrice > fib.level_618) {
      score -= 0.3; // Zona de venta
    }
  }

  return score;
}

/**
 * Combina las 3 estrategias con pesos
 */
export function combineStrategies(
  ohlcv: OHLCV[],
  currentPrice: number,
  adx: number | null,
  ema200: number | null,
  ema50: number | null
): { score: number; strategies: string[] } {

  const meanReversionScore = analyzeMeanReversion(ohlcv, currentPrice);
  const trendFollowingScore = analyzeTrendFollowing(adx, currentPrice, ema200, ema50);
  const fibonacciScore = analyzeFibonacci(ohlcv, currentPrice);

  // Pesos: Mean Reversion 30%, Trend Following 40%, Fibonacci 30%
  const combinedScore =
    meanReversionScore * 0.3 +
    trendFollowingScore * 0.4 +
    fibonacciScore * 0.3;

  // Detectar qué estrategias dan señal
  const activeStrategies: string[] = [];

  if (Math.abs(meanReversionScore) > 0.5) {
    activeStrategies.push(`Mean Reversion (${meanReversionScore > 0 ? '+' : ''}${meanReversionScore.toFixed(1)})`);
  }

  if (Math.abs(trendFollowingScore) > 0.5) {
    activeStrategies.push(`Trend Following (${trendFollowingScore > 0 ? '+' : ''}${trendFollowingScore.toFixed(1)})`);
  }

  if (Math.abs(fibonacciScore) > 0.5) {
    activeStrategies.push(`Fibonacci (${fibonacciScore > 0 ? '+' : ''}${fibonacciScore.toFixed(1)})`);
  }

  return {
    score: combinedScore,
    strategies: activeStrategies.length > 0 ? activeStrategies : ['No hay estrategia activa']
  };
}

export default {
  analyzeMeanReversion,
  analyzeTrendFollowing,
  analyzeFibonacci,
  combineStrategies
};
