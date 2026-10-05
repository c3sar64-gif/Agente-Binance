import BinanceClient from '../config/binance';
import { calculateAllIndicators, OHLCV } from '../analysis/indicators';
import { detectMarketRegime, isGoodTimeToTrade, getPositionSizeMultiplier } from '../analysis/market-regime';
import { generateSignalScore } from '../analysis/scorer';

/**
 * Test del sistema de scoring de señales
 * Ejecutar con: npm run test:scorer
 */
async function testScorer() {
  console.log('🎯 Testeando sistema de scoring de señales...\n');

  const binance = new BinanceClient();

  try {
    // Obtener datos
    console.log('📥 Obteniendo datos de BTC/USDT...');
    const ohlcv = await binance.getOHLCV('BTC/USDT', '4h', 200);

    const candles: OHLCV[] = ohlcv.map(([timestamp, open, high, low, close, volume]: number[]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume
    }));

    console.log(`✅ ${candles.length} velas obtenidas\n`);

    // Detectar régimen de mercado
    console.log('📊 Detectando régimen de mercado...');
    console.log('─'.repeat(80));
    const regime = detectMarketRegime(candles);

    console.log(`Régimen: ${regime.regime.toUpperCase()}`);
    console.log(`  Fuerza: ${regime.strength.toFixed(1)}/100`);
    console.log(`  ADX: ${regime.adx?.toFixed(2) || 'N/A'} (tendencia)`);
    console.log(`  Volatilidad: ${regime.volatility?.toFixed(2) || 'N/A'}%`);
    console.log(`  Confianza: ${regime.confidence}%`);
    console.log(`  Tendencia: ${regime.trend > 0 ? '↗️ Alcista' : regime.trend < 0 ? '↘️ Bajista' : '→ Lateral'}`);

    const canOperate = isGoodTimeToTrade(regime);
    console.log(`\n¿Es buen momento para operar? ${canOperate ? '✅ SÍ' : '❌ NO'}`);

    const positionMultiplier = getPositionSizeMultiplier(regime);
    console.log(`Tamaño de posición sugerido: ${(positionMultiplier * 100).toFixed(0)}%`);

    // Calcular indicadores
    console.log('\n\n📈 Calculando indicadores técnicos...');
    const indicators = calculateAllIndicators(candles);

    // Generar score de señal
    console.log('\n\n🎯 Generando score de señal...');
    console.log('─'.repeat(80));
    const signalScore = await generateSignalScore(indicators, candles, regime, 'BTC/USDT', '4h');

    console.log(`\nTipo de señal: ${signalScore.type.toUpperCase()}`);
    console.log(`Score: ${signalScore.score.toFixed(1)}/10`);
    console.log(`Confianza: ${signalScore.confidence.toFixed(0)}%`);

    // Mostrar detalles de indicadores
    console.log('\n📊 Detalles de indicadores:');
    console.log(`  RSI: ${signalScore.indicators.rsiSignal.toFixed(1)}`);
    console.log(`  MACD: ${signalScore.indicators.macdSignal.toFixed(1)}`);
    console.log(`  Bollinger: ${signalScore.indicators.bbSignal.toFixed(1)}`);
    console.log(`  EMA: ${signalScore.indicators.emaSignal.toFixed(1)}`);
    console.log(`  Volumen: ${signalScore.indicators.volumeSignal.toFixed(1)}`);

    console.log(`\n💡 Análisis: ${signalScore.reasoning}`);

    // Mostrar recomendación
    console.log('\n\n📋 RECOMENDACIÓN:');
    console.log('─'.repeat(80));

    if (signalScore.score >= 7 && signalScore.confidence >= 70) {
      console.log(`🟢 SEÑAL FUERTE DE ${signalScore.type.toUpperCase()}`);
      console.log(`   Confianza: ${signalScore.confidence.toFixed(0)}%`);
      console.log(`   Tamaño: ${(positionMultiplier * 100).toFixed(0)}% del normal`);
    } else if (signalScore.score >= 5.5 && signalScore.confidence >= 60) {
      console.log(`🟡 Señal moderada de ${signalScore.type.toUpperCase()}`);
      console.log(`   Confianza: ${signalScore.confidence.toFixed(0)}%`);
      console.log(`   Tamaño: ${(positionMultiplier * 50).toFixed(0)}% del normal (reducido)`);
    } else {
      console.log(`⚪ MANTENER - Esperar mejor oportunidad`);
      console.log(`   Confianza: ${signalScore.confidence.toFixed(0)}%`);
    }

    console.log('\n✅ Test completado\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exitCode = 1;
  }
}

testScorer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
