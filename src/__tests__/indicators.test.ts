import BinanceClient from '../config/binance';
import { calculateAllIndicators, analyzeSignals, OHLCV } from '../analysis/indicators';

/**
 * Test de indicadores técnicos
 * Ejecutar con: npm run test:indicators
 */
async function testIndicators() {
  console.log('📊 Testeando indicadores técnicos...\n');

  const binance = new BinanceClient();

  try {
    // Obtener datos OHLCV de BTC en 1 hora
    console.log('📥 Obteniendo datos de BTC/USDT (1h)...');
    const ohlcv = await binance.getOHLCV('BTC/USDT', '1h', 200);

    // Convertir al formato esperado
    const candles: OHLCV[] = ohlcv.map(([timestamp, open, high, low, close, volume]: number[]) => ({
      timestamp,
      open,
      high,
      low,
      close,
      volume
    }));

    console.log(`✅ ${candles.length} velas obtenidas\n`);

    // Mostrar últimas 5 velas
    console.log('📈 Últimas 5 velas:');
    console.log('─'.repeat(80));
    candles.slice(-5).forEach((candle, index) => {
      const date = new Date(candle.timestamp);
      console.log(
        `[${index}] ${date.toISOString().substring(0, 16)} | ` +
        `O: $${candle.open.toFixed(2)} | ` +
        `H: $${candle.high.toFixed(2)} | ` +
        `L: $${candle.low.toFixed(2)} | ` +
        `C: $${candle.close.toFixed(2)} | ` +
        `V: ${(candle.volume / 1000000).toFixed(2)}M`
      );
    });

    // Calcular indicadores
    console.log('\n\n📊 Indicadores técnicos:');
    console.log('─'.repeat(80));

    const indicators = calculateAllIndicators(candles);

    console.log('\n🔴 RSI (Relative Strength Index)');
    console.log(`   Valor: ${indicators.rsi?.toFixed(2) || 'N/A'}`);
    console.log(`   Interpretación: ${
      !indicators.rsi ? 'N/A' :
      indicators.rsi < 30 ? '🟢 SOBREVENTA (posible compra)' :
      indicators.rsi > 70 ? '🔴 SOBRECOMPRA (posible venta)' :
      '⚪ Neutral'
    }`);

    console.log('\n📊 MACD (Moving Average Convergence Divergence)');
    console.log(`   Línea: ${indicators.macd.line?.toFixed(4) || 'N/A'}`);
    console.log(`   Signal: ${indicators.macd.signal?.toFixed(4) || 'N/A'}`);
    console.log(`   Histogram: ${indicators.macd.histogram?.toFixed(4) || 'N/A'}`);
    console.log(`   Interpretación: ${
      !indicators.macd.line || !indicators.macd.signal ? 'N/A' :
      indicators.macd.line > indicators.macd.signal ? '🟢 CRUCE ALCISTA' :
      '🔴 CRUCE BAJISTA'
    }`);

    console.log('\n📈 Bollinger Bands');
    console.log(`   Superior: $${indicators.bollinger.upper?.toFixed(2) || 'N/A'}`);
    console.log(`   Media: $${indicators.bollinger.middle?.toFixed(2) || 'N/A'}`);
    console.log(`   Inferior: $${indicators.bollinger.lower?.toFixed(2) || 'N/A'}`);
    const currentPrice = candles[candles.length - 1].close;
    console.log(`   Precio actual: $${currentPrice.toFixed(2)}`);

    console.log('\n📊 EMAs (Medias Móviles Exponenciales)');
    console.log(`   EMA 9: $${indicators.ema.ema9?.toFixed(2) || 'N/A'}`);
    console.log(`   EMA 20: $${indicators.ema.ema20?.toFixed(2) || 'N/A'}`);
    console.log(`   EMA 50: $${indicators.ema.ema50?.toFixed(2) || 'N/A'}`);
    console.log(`   EMA 200: $${indicators.ema.ema200?.toFixed(2) || 'N/A'}`);

    console.log('\n⚡ Volatilidad');
    console.log(`   ATR: ${indicators.atr?.toFixed(2) || 'N/A'}`);
    console.log(`   ADX: ${indicators.adx?.toFixed(2) || 'N/A'} ${
      !indicators.adx ? '' :
      indicators.adx > 25 ? '(Tendencia fuerte)' : '(Mercado lateral)'
    }`);

    console.log('\n📦 Volumen');
    console.log(`   Volumen actual: ${(indicators.volume.current / 1000000).toFixed(2)}M`);
    console.log(`   Promedio 20 velas: ${(indicators.volume.avg20 / 1000000).toFixed(2)}M`);
    console.log(`   Ratio: ${(indicators.volume.current / indicators.volume.avg20).toFixed(2)}x`);

    // Análisis de señales
    console.log('\n\n🎯 Análisis de Señales:');
    console.log('─'.repeat(80));
    const signalScore = analyzeSignals(indicators, currentPrice);
    console.log(`Score de señal: ${signalScore.toFixed(1)}/10`);
    console.log(`Interpretación: ${
      signalScore < -6 ? '🔴 SEÑAL FUERTE DE VENTA' :
      signalScore < -3 ? '🔴 Señal de venta' :
      signalScore < 3 ? '⚪ Neutral' :
      signalScore < 6 ? '🟢 Señal de compra' :
      '🟢 SEÑAL FUERTE DE COMPRA'
    }`);

    console.log('\n✅ Test completado\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exitCode = 1;
  }
}

testIndicators().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
