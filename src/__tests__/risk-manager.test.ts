import assert from 'node:assert';
import { RiskManager, computePnl } from '../trading/risk-manager';

/**
 * Test del gestor de riesgo
 * Ejecutar con: npm run test:risk
 */
function testRiskManager() {
  console.log('💰 Testeando gestor de riesgo...\n');

  // Inicializar con capital inicial de $10,000
  const initialCapital = 10000;
  const riskManager = new RiskManager(initialCapital);

  // Mostrar estado inicial
  console.log('📊 Estado Inicial:');
  console.log('─'.repeat(80));
  let state = riskManager.getState();
  console.log(`Capital total: $${state.totalCapital.toFixed(2)}`);
  console.log(`Capital disponible: $${state.availableCapital.toFixed(2)}`);
  console.log(`Riesgo máximo por operación: $${state.maxRiskPerTrade.toFixed(2)} (3%)`);
  console.log(`Pérdida máxima diaria: $${state.maxDailyLoss.toFixed(2)} (9%)`);
  console.log(`Pérdida máxima semanal: $${state.maxWeeklyLoss.toFixed(2)} (15%)`);

  // Simular un trade
  console.log('\n\n💹 Simulando trade de BTC/USDT:');
  console.log('─'.repeat(80));

  const entryPrice = 70000;
  const volatility = 500; // ATR = $500
  const signalConfidence = 8; // Score 8/10
  const positionMultiplier = 1; // Régimen normal

  const positionSize = riskManager.calculatePositionSize(
    entryPrice,
    volatility,
    signalConfidence,
    2, // 1:2 ratio
    positionMultiplier
  );

  console.log(`Precio de entrada: $${entryPrice}`);
  console.log(`Volatilidad (ATR): $${volatility}`);
  console.log(`Confianza de señal: ${signalConfidence}/10`);
  console.log(`\n✅ Tamaño de posición válido: ${positionSize.isValid}`);
  console.log(`Cantidad a comprar: ${positionSize.quantity.toFixed(5)} BTC`);
  console.log(`Riesgo en esta operación: $${positionSize.riskAmount.toFixed(2)}`);
  console.log(`Potencial de ganancia: $${positionSize.potentialProfit.toFixed(2)}`);
  console.log(`Ratio R:R: 1:${positionSize.riskRewardRatio}`);
  console.log(`\n📌 ${positionSize.reason}`);

  // Calcular niveles
  console.log('\n\n🎯 Cálculo de niveles:');
  console.log('─'.repeat(80));
  const levels = riskManager.calculateLevels(entryPrice, volatility, 2);
  console.log(`Stop-Loss: $${levels.stopLoss.toFixed(2)} (${levels.stopLossPercent.toFixed(2)}%)`);
  console.log(`Take-Profit: $${levels.takeProfit.toFixed(2)} (${levels.takeProfitPercent.toFixed(2)}%)`);

  // Abrir posición
  console.log('\n\n📈 Abriendo posición:');
  console.log('─'.repeat(80));
  const position = riskManager.openPosition(
    'BTC/USDT',
    'buy',
    entryPrice,
    positionSize.quantity,
    levels.stopLoss,
    levels.takeProfit
  );

  console.log(`ID de posición: ${position.id}`);
  console.log(`Símbolo: ${position.symbol}`);
  console.log(`Lado: ${position.side.toUpperCase()}`);
  console.log(`Entrada: $${position.entryPrice}`);
  console.log(`Stop-Loss: $${position.stopLoss.toFixed(2)}`);
  console.log(`Take-Profit: $${position.takeProfit.toFixed(2)}`);

  // Estado después de abrir posición
  console.log('\n\n💼 Estado después de abrir posición:');
  console.log('─'.repeat(80));
  state = riskManager.getState();
  console.log(`Posiciones abiertas: ${state.openPositions}`);
  console.log(`Capital usado: $${state.usedCapital.toFixed(2)}`);
  console.log(`Capital disponible: $${state.availableCapital.toFixed(2)}`);
  console.log(`Pérdida diaria: $${state.dailyLoss.toFixed(2)}`);

  // Simular cierre de posición (ganancia)
  console.log('\n\n✅ Cerrando posición (GANANCIA):');
  console.log('─'.repeat(80));
  const exitPrice = levels.takeProfit; // Tomar ganancia completa
  const closedPos = riskManager.closePosition(position.id, exitPrice, 'take-profit');

  if (closedPos && closedPos.exitPrice) {
    const pnl = (closedPos.exitPrice - closedPos.entryPrice) * closedPos.quantity;
    console.log(`Precio de salida: $${exitPrice}`);
    console.log(`P&L: $${pnl.toFixed(2)}`);
    console.log(`Razón: ${closedPos.exitReason}`);
  }

  // Estadísticas finales
  console.log('\n\n📊 Estadísticas finales:');
  console.log('─'.repeat(80));
  const stats = riskManager.getStats();
  console.log(`Total de trades: ${stats.totalTrades}`);
  console.log(`Trades ganadores: ${stats.winningTrades}`);
  console.log(`Trades perdedores: ${stats.losingTrades}`);
  console.log(`Win rate: ${stats.winRate.toFixed(1)}%`);
  console.log(`P&L Total: $${stats.totalPnL.toFixed(2)}`);
  console.log(`Return: ${stats.returnPercent.toFixed(2)}%`);

  // Mostrar estado final
  console.log('\n\n💰 Estado final:');
  console.log('─'.repeat(80));
  state = riskManager.getState();
  console.log(`Capital total: $${state.totalCapital.toFixed(2)}`);
  console.log(`Capital disponible: $${state.availableCapital.toFixed(2)}`);
  console.log(`Posiciones abiertas: ${state.openPositions}`);
  console.log(`Pérdida diaria: $${state.dailyLoss.toFixed(2)}`);
  console.log(`¿Pausar por límite diario? ${riskManager.shouldPauseDailyLoss() ? '🔴 SÍ' : '🟢 NO'}`);

  // Probar límites
  console.log('\n\n🔒 Testando límites de riesgo:');
  console.log('─'.repeat(80));

  // Intentar abrir 5 más posiciones para llegar al máximo
  for (let i = 0; i < 5; i++) {
    const newPos = riskManager.calculatePositionSize(
      entryPrice,
      volatility,
      signalConfidence,
      2,
      positionMultiplier
    );

    if (newPos.isValid) {
      const p = riskManager.openPosition(
        'BTC/USDT',
        'buy',
        entryPrice,
        newPos.quantity,
        levels.stopLoss,
        levels.takeProfit
      );
      console.log(`✅ Posición ${i + 2} abierta (total: ${riskManager.getState().openPositions})`);
    } else {
      console.log(`❌ No se puede abrir posición ${i + 2}: ${newPos.reason}`);
      break;
    }
  }

  // Estado final
  state = riskManager.getState();
  console.log(`\nPosiciones abiertas finales: ${state.openPositions}/5`);

  // Nunca se compromete más capital (nocional) del disponible en spot
  assert.ok(state.usedCapital <= state.totalCapital, 'El nocional abierto no debe superar el capital');
  assert.ok(state.openPositions <= 5, 'Máximo 5 posiciones abiertas');

  console.log('\n✅ Test completado\n');
}

/**
 * Comprobaciones de regresión del P&L y de los niveles
 */
function testRiskInvariants() {
  // P&L según el lado de la operación
  assert.strictEqual(computePnl('buy', 100, 110, 2), 20);
  assert.strictEqual(computePnl('sell', 100, 110, 2), -20);
  assert.strictEqual(computePnl('sell', 100, 90, 2), 20);

  // Una venta perdedora suma a la pérdida diaria
  const rm = new RiskManager(10000);
  const short = rm.openPosition('ETH/USDT', 'sell', 100, 1, 105, 90);
  rm.closePosition(short.id, 105, 'stop-loss');
  assert.strictEqual(rm.getState().dailyLoss, 5, 'Short perdedor debe contar como pérdida');
  assert.strictEqual(rm.calculateTotalPnL(), -5);

  // Stop-loss acotado aunque el ATR sea absurdo (p. ej. ATR de BTC aplicado a DOGE)
  const levels = rm.calculateLevels(0.1, 500, 2, '5m');
  assert.ok(levels.stopLoss > 0, 'El stop-loss nunca debe ser negativo');
  assert.ok(levels.stopLossPercent <= 10, 'Stop-loss máximo 10%');

  // El tamaño se calcula con el mismo stop que se coloca realmente
  const size = rm.calculatePositionSize(70000, 500, 8, 2, 1, '5m');
  const realLevels = rm.calculateLevels(70000, 500, 2, '5m');
  assert.ok(size.isValid);
  assert.ok(Math.abs(size.riskAmount - size.quantity * (70000 - realLevels.stopLoss)) < 1, 'Riesgo coherente con el SL real');

  console.log('✅ Invariantes de riesgo OK');
}

try {
  testRiskManager();
  testRiskInvariants();
} catch (error) {
  console.error('❌ Error:', error);
  process.exitCode = 1;
}
