/**
 * CLI para ejecutar backtests
 * Uso: npm run backtest -- --symbol BTC/USDT --days 30
 */

import BinanceClient from '../config/binance';
import { runBacktest, formatBacktestResult } from './backtest';

async function main() {
  // Parsear argumentos
  const args = process.argv.slice(2);
  let symbol = 'BTC/USDT';
  let days = 30;
  let initialCapital = 10000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--symbol' && args[i + 1]) symbol = args[++i];
    if (args[i] === '--days' && args[i + 1]) days = parseInt(args[++i]);
    if (args[i] === '--capital' && args[i + 1]) initialCapital = parseInt(args[++i]);
  }

  console.log('\n🔄 Iniciando backtest...');
  console.log(`📊 Símbolo: ${symbol}`);
  console.log(`📅 Período: ${days} días`);
  console.log(`💰 Capital inicial: $${initialCapital}\n`);

  try {
    const binanceClient = new BinanceClient();

    // Obtener datos históricos
    console.log('📥 Descargando datos históricos...');
    const ohlcvData = await binanceClient.getOHLCV(symbol, '1h', days * 24);

    if (ohlcvData.length === 0) {
      console.error('❌ No se obtuvieron datos');
      process.exit(1);
    }

    console.log(`✅ ${ohlcvData.length} velas cargadas\n`);

    // Ejecutar backtest
    console.log('⚙️ Ejecutando backtesting...');
    const stats = await runBacktest(symbol, ohlcvData, initialCapital);

    // Mostrar resultados
    console.log(formatBacktestResult(stats));

    // Guardar resultados en JSON
    const resultsFile = `backtest-${symbol.replace('/', '-')}-${new Date().getTime()}.json`;
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile(
      `./backtests/${resultsFile}`,
      JSON.stringify(stats, null, 2)
    );
    console.log(`📁 Resultados guardados en: ./backtests/${resultsFile}\n`);

  } catch (error) {
    console.error('❌ Error en backtest:', error);
    process.exit(1);
  }
}

main();
