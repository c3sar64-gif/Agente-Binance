import BinanceClient from '../config/binance';
import BybitClient from '../config/bybit';

/**
 * Script de prueba para verificar conexiones
 * Ejecutar con: npm run test
 */
async function testConnections() {
  console.log('🔍 Testeando conexiones...\n');

  // Test Binance Testnet
  console.log('📊 BINANCE TESTNET');
  console.log('─'.repeat(40));
  const binance = new BinanceClient();
  const binanceConnected = await binance.testConnection();

  if (binanceConnected) {
    try {
      const balance = await binance.getBalance();
      console.log('Saldos principales:');
      Object.entries(balance.free || {}).forEach(([coin, amount]) => {
        const total = (balance.total || {})[coin];
        if (Number(amount) > 0 || Number(total) > 0) {
          console.log(`  ${coin}: ${amount} (Total: ${total})`);
        }
      });
    } catch (error) {
      console.error('Error obteniendo balance:', error);
    }

    // Obtener precio de BTC
    try {
      const btcPrice = await binance.getPrice('BTC/USDT');
      console.log(`\nPrecio actual BTC/USDT: $${btcPrice}`);
    } catch (error) {
      console.error('Error obteniendo precio:', error);
    }
  }

  console.log('\n');

  // Test Bybit Demo
  console.log('📊 BYBIT DEMO');
  console.log('─'.repeat(40));
  const bybit = new BybitClient();
  const bybitConnected = await bybit.testConnection();

  if (bybitConnected) {
    try {
      const balance = await bybit.getBalance();
      console.log('Saldos principales:');
      Object.entries(balance.free || {}).forEach(([coin, amount]) => {
        const total = (balance.total || {})[coin];
        if (Number(amount) > 0 || Number(total) > 0) {
          console.log(`  ${coin}: ${amount} (Total: ${total})`);
        }
      });
    } catch (error) {
      console.error('Error obteniendo balance:', error);
    }

    // Obtener precio de BTC
    try {
      const btcPrice = await bybit.getPrice('BTC/USDT');
      console.log(`\nPrecio actual BTC/USDT: $${btcPrice}`);
    } catch (error) {
      console.error('Error obteniendo precio:', error);
    }
  }

  console.log('\n✅ Prueba completada');
}

testConnections().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
