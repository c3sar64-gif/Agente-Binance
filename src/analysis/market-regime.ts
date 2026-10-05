import { OHLCV, calculateEMAs, calculateATR, calculateADX } from './indicators';

/**
 * Tipos de regímenes de mercado
 */
export type MarketRegime = 'bullish' | 'bearish' | 'sideways' | 'high_volatility' | 'unknown';

/**
 * Resultado del análisis de régimen
 */
export interface MarketRegimeAnalysis {
  regime: MarketRegime;
  strength: number; // 0-100, qué tan fuerte es la tendencia
  adx: number | null;
  volatility: number | null;
  trend: number; // -1 (bajista), 0 (lateral), 1 (alcista)
  confidence: number; // 0-100, confianza en la detección
}

/**
 * Detecta el régimen de mercado basado en múltiples indicadores
 */
export function detectMarketRegime(ohlcv: OHLCV[]): MarketRegimeAnalysis {
  if (ohlcv.length < 200) {
    return {
      regime: 'unknown',
      strength: 0,
      adx: null,
      volatility: null,
      trend: 0,
      confidence: 0
    };
  }

  const closes = ohlcv.map(c => c.close);
  const currentPrice = closes[closes.length - 1];

  // Obtener EMAs
  const emas = calculateEMAs(closes);

  // Obtener volatilidad (ATR)
  const atr = calculateATR(ohlcv, 14);
  const volatilityPercent = atr && atr > 0 ? (atr / currentPrice) * 100 : null;

  // Obtener ADX (fuerza de tendencia)
  const adx = calculateADX(ohlcv, 14);

  // Determinar tendencia basada en EMAs
  let trendScore = 0;

  if (emas.ema200 && currentPrice > emas.ema200 * 1.02) {
    trendScore += 2; // Precio claramente arriba de EMA200
  } else if (emas.ema200 && currentPrice < emas.ema200 * 0.98) {
    trendScore -= 2; // Precio claramente abajo de EMA200
  }

  if (emas.ema50 && emas.ema200 && emas.ema50 > emas.ema200) {
    trendScore += 1; // EMA50 arriba de EMA200 (golden cross)
  } else if (emas.ema50 && emas.ema200 && emas.ema50 < emas.ema200) {
    trendScore -= 1; // EMA50 abajo de EMA200 (death cross)
  }

  if (emas.ema20 && emas.ema50 && emas.ema20 > emas.ema50) {
    trendScore += 0.5; // Momentum cortoplacista alcista
  } else if (emas.ema20 && emas.ema50 && emas.ema20 < emas.ema50) {
    trendScore -= 0.5; // Momentum cortoplacista bajista
  }

  // Analizar volatilidad
  const isHighVolatility = volatilityPercent && volatilityPercent > 3; // ATR > 3% del precio

  // Analizar fuerza de tendencia (ADX)
  const hasFirmTrend = adx && adx > 25; // ADX > 25 = tendencia fuerte
  const isWeakTrend = adx && adx < 20; // ADX < 20 = sin tendencia

  // Determinar régimen
  let regime: MarketRegime = 'sideways';
  let strength = 0;
  let confidence = 0;

  if (isHighVolatility && !hasFirmTrend) {
    // Alta volatilidad sin tendencia clara
    regime = 'high_volatility';
    strength = volatilityPercent ? Math.min(100, volatilityPercent * 20) : 0;
    confidence = 70;
  } else if (hasFirmTrend) {
    // Tendencia clara
    strength = adx ? Math.min(100, adx) : 0;
    confidence = 85;

    if (trendScore > 1) {
      regime = 'bullish';
    } else if (trendScore < -1) {
      regime = 'bearish';
    } else {
      regime = 'sideways';
      confidence = 60;
    }
  } else if (isWeakTrend) {
    // Sin tendencia (mercado lateral)
    regime = 'sideways';
    strength = 0;
    confidence = 70;
  } else {
    // Por defecto, usar trend score
    if (trendScore > 0.5) {
      regime = 'bullish';
      strength = Math.min(100, Math.abs(trendScore) * 20);
      confidence = 65;
    } else if (trendScore < -0.5) {
      regime = 'bearish';
      strength = Math.min(100, Math.abs(trendScore) * 20);
      confidence = 65;
    } else {
      regime = 'sideways';
      strength = 0;
      confidence = 50;
    }
  }

  return {
    regime,
    strength,
    adx: adx || null,
    volatility: volatilityPercent || null,
    trend: trendScore > 0.5 ? 1 : trendScore < -0.5 ? -1 : 0,
    confidence
  };
}

/**
 * Determina si es buen momento para operar basado en el régimen
 */
export function isGoodTimeToTrade(regime: MarketRegimeAnalysis): boolean {
  // No operar en volatilidad EXTREMADAMENTE alta
  if (regime.regime === 'high_volatility' && regime.volatility && regime.volatility > 10) {
    return false; // Solo rechaza volatilidad > 10
  }

  // Permitir operar en TODOS los regímenes (sideways, bullish, bearish)
  // Dejar que las estrategias decidan si es buen momento
  // Antes: if (regime.regime === 'sideways' && regime.confidence < 60) return false;

  // Permitir si hay suficiente confianza EN CUALQUIER régimen
  if (regime.confidence >= 40) {
    return true; // Bajé de 70 a 40 para permitir operaciones
  }

  return false;
}

/**
 * Ajusta el tamaño de posición basado en el régimen
 * Retorna multiplicador (1 = tamaño normal, 0.5 = media, 0.25 = mini)
 */
export function getPositionSizeMultiplier(regime: MarketRegimeAnalysis): number {
  // En alta volatilidad, reducir a 50%
  if (regime.regime === 'high_volatility') {
    return 0.5;
  }

  // En mercado lateral débil, reducir a 25%
  if (regime.regime === 'sideways' && regime.confidence < 60) {
    return 0.25;
  }

  // En tendencias claras, tamaño normal
  if (regime.confidence >= 75) {
    return 1;
  }

  // Por defecto, 75% del tamaño
  return 0.75;
}

export default {
  detectMarketRegime,
  isGoodTimeToTrade,
  getPositionSizeMultiplier
};
