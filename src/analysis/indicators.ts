import {
  RSI,
  MACD,
  BollingerBands,
  EMA,
  SMA,
  ATR,
  ADX
} from 'technicalindicators';

/**
 * Interfaz para datos OHLCV
 */
export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Resultado de análisis de indicadores
 */
export interface IndicatorResult {
  rsi: number | null;
  macd: {
    line: number | null;
    signal: number | null;
    histogram: number | null;
  };
  bollinger: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
  };
  ema: {
    ema9: number | null;
    ema20: number | null;
    ema50: number | null;
    ema200: number | null;
  };
  atr: number | null;
  adx: number | null;
  volume: {
    current: number;
    avg20: number;
  };
}

/**
 * Calcula el RSI (Relative Strength Index)
 * Rango: 0-100
 * > 70 = sobreventa, < 30 = sobrecompra
 */
export function calculateRSI(closes: number[], period: number = 14): number | null {
  try {
    if (closes.length < period + 1) return null;

    const rsiValues = RSI.calculate({
      values: closes,
      period: period
    });

    return rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;
  } catch (error) {
    console.error('Error calculating RSI:', error);
    return null;
  }
}

/**
 * Calcula el MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(closes: number[]) {
  try {
    if (closes.length < 26) return { line: null, signal: null, histogram: null };

    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    if (macdValues.length === 0) {
      return { line: null, signal: null, histogram: null };
    }

    const lastMACD = macdValues[macdValues.length - 1];
    return {
      line: lastMACD.MACD || null,
      signal: lastMACD.signal || null,
      histogram: lastMACD.histogram || null
    };
  } catch (error) {
    console.error('Error calculating MACD:', error);
    return { line: null, signal: null, histogram: null };
  }
}

/**
 * Calcula las Bollinger Bands
 */
export function calculateBollingerBands(closes: number[], period: number = 20, stdDev: number = 2) {
  try {
    if (closes.length < period) return { upper: null, middle: null, lower: null };

    const bbValues = BollingerBands.calculate({
      period: period,
      values: closes,
      stdDev: stdDev
    });

    if (bbValues.length === 0) {
      return { upper: null, middle: null, lower: null };
    }

    const lastBB = bbValues[bbValues.length - 1];
    return {
      upper: lastBB.upper || null,
      middle: lastBB.middle || null,
      lower: lastBB.lower || null
    };
  } catch (error) {
    console.error('Error calculating Bollinger Bands:', error);
    return { upper: null, middle: null, lower: null };
  }
}

/**
 * Calcula EMAs (Exponential Moving Averages)
 */
export function calculateEMAs(closes: number[]) {
  try {
    let ema9 = null;
    let ema20 = null;
    let ema50 = null;
    let ema200 = null;

    if (closes.length >= 9) {
      const ema9Values = EMA.calculate({ period: 9, values: closes });
      ema9 = ema9Values.length > 0 ? ema9Values[ema9Values.length - 1] : null;
    }

    if (closes.length >= 20) {
      const ema20Values = EMA.calculate({ period: 20, values: closes });
      ema20 = ema20Values.length > 0 ? ema20Values[ema20Values.length - 1] : null;
    }

    if (closes.length >= 50) {
      const ema50Values = EMA.calculate({ period: 50, values: closes });
      ema50 = ema50Values.length > 0 ? ema50Values[ema50Values.length - 1] : null;
    }

    if (closes.length >= 200) {
      const ema200Values = EMA.calculate({ period: 200, values: closes });
      ema200 = ema200Values.length > 0 ? ema200Values[ema200Values.length - 1] : null;
    }

    return {
      ema9,
      ema20,
      ema50,
      ema200
    };
  } catch (error) {
    console.error('Error calculating EMAs:', error);
    return {
      ema9: null,
      ema20: null,
      ema50: null,
      ema200: null
    };
  }
}

/**
 * Calcula el ATR (Average True Range)
 * Mide la volatilidad del activo
 */
export function calculateATR(ohlcv: OHLCV[], period: number = 14): number | null {
  try {
    if (ohlcv.length < period) return null;

    const highs = ohlcv.map(candle => candle.high);
    const lows = ohlcv.map(candle => candle.low);
    const closes = ohlcv.map(candle => candle.close);

    const atrValues = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: period
    });

    return atrValues.length > 0 ? atrValues[atrValues.length - 1] : null;
  } catch (error) {
    console.error('Error calculating ATR:', error);
    return null;
  }
}

/**
 * Calcula el ADX (Average Directional Index)
 * > 25 = tendencia fuerte, < 25 = mercado lateral
 */
export function calculateADX(ohlcv: OHLCV[], period: number = 14): number | null {
  try {
    if (ohlcv.length < period * 2) return null;

    const highs = ohlcv.map(candle => candle.high);
    const lows = ohlcv.map(candle => candle.low);
    const closes = ohlcv.map(candle => candle.close);

    const adxValues = ADX.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: period
    });

    return adxValues.length > 0 ? adxValues[adxValues.length - 1].adx : null;
  } catch (error) {
    console.error('Error calculating ADX:', error);
    return null;
  }
}

/**
 * Analiza el volumen
 */
export function analyzeVolume(ohlcv: OHLCV[]) {
  if (ohlcv.length === 0) {
    return { current: 0, avg20: 0 };
  }

  const currentVolume = ohlcv[ohlcv.length - 1].volume;

  const volumesToUse = Math.min(20, ohlcv.length);
  const recentVolumes = ohlcv.slice(-volumesToUse).map(c => c.volume);
  const avg20 = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;

  return {
    current: currentVolume,
    avg20: avg20
  };
}

/**
 * Calcula SMA (Simple Moving Average)
 */
export function calculateSMA(closes: number[], period: number): number | null {
  try {
    if (closes.length < period) return null;

    const smaValues = SMA.calculate({
      period: period,
      values: closes
    });

    return smaValues.length > 0 ? smaValues[smaValues.length - 1] : null;
  } catch (error) {
    console.error('Error calculating SMA:', error);
    return null;
  }
}

/**
 * Función principal que calcula todos los indicadores
 */
export function calculateAllIndicators(ohlcv: OHLCV[]): IndicatorResult {
  const closes = ohlcv.map(candle => candle.close);

  return {
    rsi: calculateRSI(closes),
    macd: calculateMACD(closes),
    bollinger: calculateBollingerBands(closes),
    ema: calculateEMAs(closes),
    atr: calculateATR(ohlcv),
    adx: calculateADX(ohlcv),
    volume: analyzeVolume(ohlcv)
  };
}

/**
 * Detecta señales de compra/venta basadas en indicadores
 * Retorna un score de -10 a +10
 */
export function analyzeSignals(indicators: IndicatorResult, currentPrice: number): number {
  let score = 0;

  // RSI
  if (indicators.rsi !== null) {
    if (indicators.rsi < 30) score += 2; // Sobreventa - señal de compra
    else if (indicators.rsi > 70) score -= 2; // Sobrecompra - señal de venta
  }

  // MACD
  if (indicators.macd.line !== null && indicators.macd.signal !== null) {
    if (indicators.macd.line > indicators.macd.signal) score += 2; // Cruce alcista
    else if (indicators.macd.line < indicators.macd.signal) score -= 2; // Cruce bajista
  }

  // Bollinger Bands
  if (indicators.bollinger.lower !== null && indicators.bollinger.upper !== null) {
    if (currentPrice < indicators.bollinger.lower) score += 1.5; // Precio bajo banda inferior
    else if (currentPrice > indicators.bollinger.upper) score -= 1.5; // Precio por banda superior
  }

  // EMA
  if (indicators.ema.ema200 !== null && currentPrice > indicators.ema.ema200) {
    score += 1; // Precio arriba de EMA 200 - tendencia alcista
  } else if (indicators.ema.ema200 !== null && currentPrice < indicators.ema.ema200) {
    score -= 1; // Precio abajo de EMA 200 - tendencia bajista
  }

  // Volumen
  if (indicators.volume.current > indicators.volume.avg20 * 1.5) {
    score += 0.5; // Volumen alto confirma movimiento
  }

  return Math.max(-10, Math.min(10, score)); // Limitar entre -10 y +10
}

export default {
  calculateAllIndicators,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateEMAs,
  calculateATR,
  calculateADX,
  analyzeVolume,
  calculateSMA,
  analyzeSignals
};
