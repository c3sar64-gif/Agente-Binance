import { RiskManager } from '../trading/risk-manager';
import { OrderExecutor } from '../trading/executor';

/**
 * Test del ejecutor de órdenes
 * Ejecutar con: npm run test:executor
 */
async function testExecutor() {
  console.log('📋 Testeando ejecutor de órdenes...\n');

  // Inicializar
  const riskManager = new RiskManager(10000);
  const executor = new OrderExecutor(riskManager);

  // Simular parámetros de trading
  const entryPrice = 70000;
  const volatility = 500;
  const signalConfidence = 8;

  // Calcular tamaño de posición
  const positionSize = riskManager.calculatePositionSize(
    entryPrice,
    volatility,
    signalConfidence,
    2,
    1
  );

  const levels = riskManager.calculateLevels(entryPrice, volatility, 2);

  // Crear orden válida
  console.log('📝 Creando orden válida:');
  console.log('─'.repeat(80));
  const validOrder = {
    symbol: 'BTC/USDT',
    side: 'buy' as const,
    entryPrice: entryPrice,
    quantity: positionSize.quantity,
    stopLoss: levels.stopLoss,
    takeProfit: levels.takeProfit,
    exchange: 'binance' as const
  };

  console.log(`Símbolo: ${validOrder.symbol}`);
  console.log(`Lado: ${validOrder.side.toUpperCase()}`);
  console.log(`Cantidad: ${validOrder.quantity.toFixed(6)}`);
  console.log(`Entrada: $${validOrder.entryPrice}`);
  console.log(`Stop-Loss: $${validOrder.stopLoss.toFixed(2)}`);
  console.log(`Take-Profit: $${validOrder.takeProfit.toFixed(2)}`);

  // Ejecutar orden
  console.log('\n\n📤 Ejecutando orden...');
  const results1 = await executor.executeOrder(validOrder);

  // Crear orden inválida (stop-loss incorrecto)
  console.log('\n📝 Intentando crear orden inválida (SL incorrecto):');
  console.log('─'.repeat(80));
  const invalidOrder = {
    symbol: 'BTC/USDT',
    side: 'buy' as const,
    entryPrice: entryPrice,
    quantity: positionSize.quantity,
    stopLoss: entryPrice * 1.05, // Stop-loss ARRIBA de entrada (incorrecto para compra)
    takeProfit: levels.takeProfit,
    exchange: 'binance' as const
  };

  console.log('\n📤 Intentando ejecutar...');
  const results2 = await executor.executeOrder(invalidOrder);

  // Crear orden con ratio R:R insuficiente
  console.log('\n📝 Intentando crear orden con ratio R:R insuficiente:');
  console.log('─'.repeat(80));
  const poorRatioOrder = {
    symbol: 'ETH/USDT',
    side: 'buy' as const,
    entryPrice: 3000,
    quantity: 0.1,
    stopLoss: 2990, // Solo $10 de riesgo
    takeProfit: 3005, // Solo $5 de ganancia (ratio 0.5:1)
    exchange: 'binance' as const
  };

  console.log('\n📤 Intentando ejecutar...');
  const results3 = await executor.executeOrder(poorRatioOrder);

  // Estadísticas
  console.log('\n\n📊 Estadísticas de ejecución:');
  console.log('─'.repeat(80));
  const stats = executor.getExecutionStats();
  console.log(`Total de órdenes: ${stats.totalOrders}`);
  console.log(`Exitosas: ${stats.successful}`);
  console.log(`Fallidas: ${stats.failed}`);
  console.log(`Tasa de éxito: ${stats.successRate.toFixed(1)}%`);

  // Mostrar posiciones abiertas
  console.log('\n\n💼 Posiciones abiertas:');
  console.log('─'.repeat(80));
  const openPositions = riskManager.getOpenPositions();
  if (openPositions.length > 0) {
    openPositions.forEach(pos => {
      console.log(`\n${pos.symbol} - ${pos.side.toUpperCase()}`);
      console.log(`  Entrada: $${pos.entryPrice}`);
      console.log(`  SL: $${pos.stopLoss.toFixed(2)}`);
      console.log(`  TP: $${pos.takeProfit.toFixed(2)}`);
      console.log(`  Riesgo: $${pos.riskAmount.toFixed(2)}`);
    });
  } else {
    console.log('No hay posiciones abiertas (testnet)');
  }

  // Estado final del riesgo
  console.log('\n\n💰 Estado final del riesgo:');
  console.log('─'.repeat(80));
  const state = riskManager.getState();
  console.log(`Capital total: $${state.totalCapital.toFixed(2)}`);
  console.log(`Capital disponible: $${state.availableCapital.toFixed(2)}`);
  console.log(`Posiciones abiertas: ${state.openPositions}`);
  console.log(`Pérdida diaria: $${state.dailyLoss.toFixed(2)}`);

  console.log('\n✅ Test completado\n');
}

testExecutor().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
