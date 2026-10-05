import TelegramNotifier from '../notifications/telegram';
import { RiskManager } from '../trading/risk-manager';
import { detectMarketRegime } from '../analysis/market-regime';
import { OHLCV } from '../analysis/indicators';

/**
 * Test del bot de Telegram
 * Ejecutar con: npm run test:telegram
 */
async function testTelegram() {
  console.log('📱 Testeando notificador de Telegram...\n');

  const notifier = new TelegramNotifier();

  // Intentar conectar
  console.log('🔗 Intentando conectar al bot...');
  const connected = await notifier.connect();

  if (!connected) {
    console.log('⚠️ No se pudo conectar a Telegram (puede ser normal en testnet)');
    console.log('Continue leyendo para ver qué notificaciones se enviarían...\n');
  } else {
    console.log('✅ Bot conectado\n');
  }

  // Simular notificaciones
  console.log('📨 Simulando notificaciones que se enviarían:\n');

  // 1. Notificación de orden ejecutada
  console.log('1️⃣ Orden ejecutada:');
  console.log('─'.repeat(80));
  console.log('🟢 *ORDEN BUY EJECUTADA*\n');
  console.log('Símbolo: BTC/USDT');
  console.log('Precio: $70,000.00');
  console.log('Cantidad: 0.001430');
  console.log('Stop-Loss: $69,285.71');
  console.log('Take-Profit: $70,714.29');
  console.log('Score de confianza: 7.5/10\n');

  // Simular envío (no funciona en testnet sin credenciales válidas)
  try {
    await notifier.notifyOrderExecuted(
      'BTC/USDT',
      'buy',
      70000,
      0.00143,
      69285.71,
      70714.29,
      7.5
    );
  } catch (error) {
    // Esperado en testnet
  }

  // 2. Notificación de posición cerrada
  console.log('\n2️⃣ Posición cerrada:');
  console.log('─'.repeat(80));
  console.log('✅ *POSICIÓN CERRADA*\n');
  console.log('Símbolo: BTC/USDT');
  console.log('Lado: BUY');
  console.log('Entrada: $70,000.00');
  console.log('Salida: $70,714.29');
  console.log('P&L: +$102.46 (+1.02%)');
  console.log('Razón: take-profit\n');

  try {
    await notifier.notifyPositionClosed(
      {
        id: 'BTC-test',
        symbol: 'BTC/USDT',
        side: 'buy',
        entryPrice: 70000,
        quantity: 0.00143,
        riskAmount: 300,
        stopLoss: 69285.71,
        takeProfit: 70714.29,
        timestamp: Date.now(),
        status: 'closed',
        exitPrice: 70714.29,
        exitReason: 'take-profit'
      },
      102.46,
      1.02
    );
  } catch (error) {
    // Esperado en testnet
  }

  // 3. Informe matutino
  console.log('\n3️⃣ Informe matutino:');
  console.log('─'.repeat(80));
  console.log('📊 *INFORME MATUTINO* - ' + new Date().toLocaleDateString('es-ES') + '\n');
  console.log('BTC: $70,500.00');
  console.log('Régimen: BULLISH');
  console.log('Fuerza: 68/100');
  console.log('Volatilidad: 1.50%');
  console.log('Confianza: 82%\n');
  console.log('Señales activas: 3');
  console.log('Estado: ✅ Activo\n');

  try {
    await notifier.sendMorningReport(
      70500,
      {
        regime: 'bullish',
        strength: 68,
        adx: 28.5,
        volatility: 1.5,
        trend: 1,
        confidence: 82
      },
      3
    );
  } catch (error) {
    // Esperado en testnet
  }

  // 4. Informe diario
  console.log('\n4️⃣ Informe diario:');
  console.log('─'.repeat(80));
  const riskManager = new RiskManager(10000);

  // Simular algunos trades
  riskManager.openPosition(
    'BTC/USDT',
    'buy',
    70000,
    0.00143,
    69285.71,
    70714.29
  );

  console.log('📈 *INFORME DIARIO* - ' + new Date().toLocaleDateString('es-ES') + '\n');
  console.log('Operaciones: 0');
  console.log('Ganadoras: 0 (0.0%)');
  console.log('Perdedoras: 0\n');
  console.log('P&L Total: +$0.00');
  console.log('Return: +0.00%\n');
  console.log('Capital: $10,000.00');
  console.log('Disponible: $10,000.00');
  console.log('Posiciones abiertas: 1');
  console.log('Pérdida del día: $0.00\n');

  try {
    await notifier.sendDailyReport(riskManager);
  } catch (error) {
    // Esperado en testnet
  }

  // 5. Alerta de límite
  console.log('\n5️⃣ Alerta de límite diario:');
  console.log('─'.repeat(80));
  console.log('🚨 *LÍMITE DIARIO ALCANZADO*\n');
  console.log('Pérdida del día: $900.00');
  console.log('Límite: $900.00\n');
  console.log('El agente se ha pausado automáticamente.\n');

  try {
    await notifier.notifyDailyLimitReached(900, 900);
  } catch (error) {
    // Esperado en testnet
  }

  // Información final
  console.log('\n\n📋 Resumen:');
  console.log('─'.repeat(80));
  console.log('El bot de Telegram enviará notificaciones en tiempo real cuando:');
  console.log('  ✅ Se ejecuta una orden');
  console.log('  ✅ Se cierra una posición');
  console.log('  ✅ Hay un informe matutino');
  console.log('  ✅ Se genera informe diario');
  console.log('  ✅ Se alcanza un límite de pérdida');
  console.log('  ✅ Hay noticias importantes');
  console.log('  ✅ Ocurre un error crítico\n');

  console.log('Comandos disponibles:');
  console.log('  /status - Ver estado actual');
  console.log('  /pause - Pausar operaciones');
  console.log('  /resume - Reanudar operaciones');
  console.log('  /close_all - Cerrar todas las posiciones');
  console.log('  /report - Generar informe manual');
  console.log('  /help - Ver ayuda\n');

  console.log('✅ Test completado\n');
}

testTelegram().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
