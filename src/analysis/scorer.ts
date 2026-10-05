import { IndicatorResult, OHLCV } from './indicators';
import { MarketRegimeAnalysis } from './market-regime';
import { analyzeCryptoSentiment, getSentimentBoost, SentimentResult } from './sentiment';
import { combineStrategies } from './strategies';

/**
 * Tipos de señal
 */
export type SignalType = 'buy' | 'sell' | 'hold' | 'none';

/**
 * Resultado del scoring de señal
 */
export interface SignalScore {
  type: SignalType;
  score: number; // 1-10
  confidence: number; // 0-100
  indicators: {
    rsiSignal: number;
    macdSignal: number;
    bbSignal: number;
    emaSignal: number;
    volumeSignal: number;
  };
  sentiment?: SentimentResult;
  sentimentBoost?: number;
  strategies?: string[]; // Nuevas estrategias activas
  strategiesScore?: number; // Score de estrategias
  reasoning: string;
}

/**
 * Analiza RSI para generar señal
 * Retorna -2 (venta), -1 (débil venta), 0 (neutral), 1 (débil compra), 2 (compra)
 */
function scoreRSI(rsi: number | null, ohlcv: OHLCV[]): number {
  if (!rsi) return 0;

  // Detectar divergencia RSI-precio
  const hasDivergence = detectDivergence(rsi, ohlcv);

  if (rsi < 20) return hasDivergence ? 2 : 1.5; // Sobreventa extrema
  if (rsi < 30) return hasDivergence ? 2 : 1; // Sobreventa
  if (rsi > 80) return hasDivergence ? -2 : -1.5; // Sobrecompra extrema
  if (rsi > 70) return hasDivergence ? -2 : -1; // Sobrecompra
  if (rsi < 40) return 0.5; // Ligeramente bajista
  if (rsi > 60) return -0.5; // Ligeramente alcista

  return 0; // Neutral
}

/**
 * Analiza MACD para generar señal
 */
function scoreMacd(macd: IndicatorResult['macd'], ohlcv: OHLCV[]): number {
  if (!macd.line || !macd.signal) return 0;

  const bullishCross = macd.line > macd.signal && macd.histogram && macd.histogram > 0;
  const bearishCross = macd.line < macd.signal && macd.histogram && macd.histogram < 0;
  const strengthMacd = Math.abs(macd.histogram || 0);

  if (bullishCross) {
    return strengthMacd > 0.5 ? 2 : 1; // Cruce alcista fuerte o débil
  }

  if (bearishCross) {
    return strengthMacd > 0.5 ? -2 : -1; // Cruce bajista fuerte o débil
  }

  // Si está arriba de la línea signal pero sin cruce reciente
  if (macd.line > macd.signal) return 0.5;
  if (macd.line < macd.signal) return -0.5;

  return 0;
}

/**
 * Analiza Bollinger Bands para generar señal
 */
function scoreBollingerBands(bb: IndicatorResult['bollinger'], price: number): number {
  if (!bb.upper || !bb.lower || !bb.middle) return 0;

  const range = bb.upper - bb.lower;
  const distanceFromMiddle = price - bb.middle;
  const squeeze = range < bb.middle * 0.05; // Squeeze si rango < 5% del precio

  // Precio en banda inferior + RSI < 35 = compra fuerte
  if (price < bb.lower * 1.01) return squeeze ? 2 : 1.5; // Precio toca banda inferior

  // Precio en banda superior = venta
  if (price > bb.upper * 0.99) return squeeze ? -2 : -1.5; // Precio toca banda superior

  // Squeeze = prepararse para movimiento
  if (squeeze && distanceFromMiddle > 0) return 0.5;
  if (squeeze && distanceFromMiddle < 0) return -0.5;

  return 0;
}

/**
 * Analiza EMAs para generar señal
 */
function scoreEMAs(ema: IndicatorResult['ema'], price: number): number {
  let score = 0;

  // EMA 200 es la tendencia principal
  if (ema.ema200) {
    if (price > ema.ema200 * 1.03) score += 1.5; // Precio claramente arriba
    else if (price < ema.ema200 * 0.97) score -= 1.5; // Precio claramente abajo
    else if (price > ema.ema200) score += 0.5;
    else score -= 0.5;
  }

  // Golden cross EMA50/200
  if (ema.ema50 && ema.ema200 && ema.ema50 > ema.ema200 * 1.01) {
    score += 0.5; // Golden cross
  } else if (ema.ema50 && ema.ema200 && ema.ema50 < ema.ema200 * 0.99) {
    score -= 0.5; // Death cross
  }

  // EMA 20 es momentum corto plazo
  if (ema.ema20 && price > ema.ema20) score += 0.25;
  else if (ema.ema20 && price < ema.ema20) score -= 0.25;

  return score;
}

/**
 * Analiza volumen para generar señal
 */
function scoreVolume(volume: IndicatorResult['volume']): number {
  if (!volume.avg20 || volume.avg20 <= 0) return 0;
  const ratio = volume.current / volume.avg20;

  if (ratio > 2) return 1; // Volumen muy alto confirma movimiento
  if (ratio > 1.5) return 0.5; // Volumen alto
  if (ratio < 0.5) return -0.5; // Volumen bajo (señal débil)

  return 0;
}

/**
 * Detecta divergencia entre precio y indicador
 */
function detectDivergence(rsi: number, ohlcv: OHLCV[]): boolean {
  if (ohlcv.length < 10) return false;

  // Lógica simple: si RSI está bajando pero precio está subiendo (o viceversa)
  // Esto sería una divergencia
  // Por ahora retornamos false, pero esta función se puede mejorar

  return false;
}

/**
 * Genera el score final de la señal con análisis de sentimiento
 * Requiere confirmación de al menos 4 de 6 indicadores
 */
export async function generateSignalScore(
  indicators: IndicatorResult,
  ohlcv: OHLCV[],
  marketRegime: MarketRegimeAnalysis,
  symbol: string = 'BTC/USDT',
  timeframe: string = '1h',
  includeSentiment: boolean = true // false en backtests: evita llamadas a NewsAPI por vela y sesgo de noticias actuales
): Promise<SignalScore> {
  const currentPrice = ohlcv[ohlcv.length - 1].close;

  // Calcular score de cada indicador
  const rsiScore = scoreRSI(indicators.rsi, ohlcv);
  const macdScore = scoreMacd(indicators.macd, ohlcv);
  const bbScore = scoreBollingerBands(indicators.bollinger, currentPrice);
  const emaScore = scoreEMAs(indicators.ema, currentPrice);
  const volumeScore = scoreVolume(indicators.volume);

  // Calcular score de nuevas estrategias
  const strategiesResult = combineStrategies(
    ohlcv,
    currentPrice,
    indicators.adx,
    indicators.ema.ema200,
    indicators.ema.ema50
  );

  // Contar confirma (indicadores técnicos)
  const buySignals = [rsiScore, macdScore, bbScore, emaScore, volumeScore].filter(s => s > 0.5);
  const sellSignals = [rsiScore, macdScore, bbScore, emaScore, volumeScore].filter(s => s < -0.5);

  // Calcular promedio de indicadores técnicos
  const avgScore = (rsiScore + macdScore + bbScore + emaScore + volumeScore) / 5;

  // Combinar scores: 70% indicadores técnicos, 30% nuevas estrategias
  const combinedScore = (avgScore * 0.7) + (strategiesResult.score * 0.3);

  // Determinar tipo de señal (considerando ambos scores)
  let type: SignalType = 'hold';
  let score = 5; // Neutral
  let confidence = 0;

  // Thresholds lowered for better trading opportunities
  if (buySignals.length >= 4) {
    type = 'buy';
    score = Math.min(10, 5 + Math.abs(combinedScore) * 2);
    confidence = Math.min(95, 60 + buySignals.length * 10);
  } else if (sellSignals.length >= 4) {
    type = 'sell';
    score = Math.max(1, 5 - Math.abs(combinedScore) * 2);
    confidence = Math.min(95, 60 + sellSignals.length * 10);
  } else if (buySignals.length >= 3) {
    type = 'buy';
    score = 6.5 + combinedScore * 0.5;
    confidence = 50;
  } else if (sellSignals.length >= 3) {
    type = 'sell';
    score = 3.5 - combinedScore * 0.5;
    confidence = 50;
  } else if (buySignals.length >= 2) {
    // New: 2+ buy signals = weak buy
    type = 'buy';
    score = 5.8 + combinedScore * 0.3;
    confidence = 40;
  } else if (sellSignals.length >= 2) {
    // New: 2+ sell signals = weak sell
    type = 'sell';
    score = 4.2 - combinedScore * 0.3;
    confidence = 40;
  } else if (Math.abs(combinedScore) > 0.8) {
    // Lowered from 1.0 to 0.8 for combined score threshold
    type = combinedScore > 0 ? 'buy' : 'sell';
    score = 5 + combinedScore;
    confidence = 35;
  } else if (Math.abs(avgScore) > 0.5) {
    // New: use avgScore if combinedScore is weak
    type = avgScore > 0 ? 'buy' : 'sell';
    score = 5 + avgScore;
    confidence = 33;
  } else {
    type = 'hold';
    score = 5;
    confidence = 30;
  }

  // Aumentar confianza si las nuevas estrategias están alineadas
  if (strategiesResult.strategies.length > 1 && Math.abs(strategiesResult.score) > 0.5) {
    confidence *= 1.15; // Aumentar confianza si múltiples estrategias activas
  }

  // Ajustar por régimen de mercado
  if (marketRegime.regime === 'high_volatility') {
    confidence *= 0.7; // Reducir confianza en volatilidad alta
  }

  if (marketRegime.regime === 'sideways' && marketRegime.confidence < 60) {
    confidence *= 0.6; // Reducir confianza en mercado lateral débil
  }

  // Análisis de sentimiento (solo para timeframes mayores a 5m)
  let sentiment: SentimentResult | undefined;
  let sentimentBoost: number = 1.0;

  const isShortTimeframe = timeframe === '1m' || timeframe === '5m';
  if (includeSentiment && !isShortTimeframe) {
    try {
      sentiment = await analyzeCryptoSentiment(symbol);
      sentimentBoost = getSentimentBoost(sentiment);

      // Ajustar score basado en sentimiento
      score *= sentimentBoost;

      // Aumentar confianza si sentimiento es muy consistente
      if (sentiment.confidence > 70) {
        confidence *= (1 + (Math.abs(sentiment.overallSentiment) * 0.2));
      }
    } catch (error) {
      console.warn('Error en análisis de sentimiento:', error);
    }
  }

  // Generar razonamiento
  const reasoning = generateReasoning(
    buySignals.length,
    sellSignals.length,
    type,
    marketRegime
  );

  return {
    type,
    score: Math.max(1, Math.min(10, score)),
    confidence: Math.max(0, Math.min(100, confidence)),
    indicators: {
      rsiSignal: rsiScore,
      macdSignal: macdScore,
      bbSignal: bbScore,
      emaSignal: emaScore,
      volumeSignal: volumeScore
    },
    sentiment,
    sentimentBoost,
    strategies: strategiesResult.strategies,
    strategiesScore: strategiesResult.score,
    reasoning
  };
}

/**
 * Genera un resumen textual del análisis
 */
function generateReasoning(
  buyCount: number,
  sellCount: number,
  type: SignalType,
  regime: MarketRegimeAnalysis
): string {
  const parts: string[] = [];

  parts.push(`${buyCount} señales de compra, ${sellCount} de venta`);

  if (regime.regime === 'bullish') {
    parts.push('Tendencia alcista confirmada');
  } else if (regime.regime === 'bearish') {
    parts.push('Tendencia bajista confirmada');
  } else if (regime.regime === 'sideways') {
    parts.push('Mercado lateral');
  } else if (regime.regime === 'high_volatility') {
    parts.push('Volatilidad alta - cautela');
  }

  if (type === 'buy' && buyCount >= 4) {
    parts.push('Múltiples indicadores confirman compra');
  } else if (type === 'sell' && sellCount >= 4) {
    parts.push('Múltiples indicadores confirman venta');
  } else if (type === 'hold') {
    parts.push('Señales mixtas - esperar confirmación');
  }

  return parts.join(' | ');
}

export default {
  generateSignalScore,
  scoreRSI,
  scoreMacd,
  scoreBollingerBands,
  scoreEMAs,
  scoreVolume
};
