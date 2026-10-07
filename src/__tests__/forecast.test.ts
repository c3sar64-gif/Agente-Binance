import assert from 'node:assert';
import { buildForecast } from '../analysis/forecast';
import { OHLCV } from '../analysis/indicators';

/**
 * Test de la proyección por análogos (sin red: velas sintéticas)
 * Ejecutar con: npm run test:forecast
 */

const STEP = 300_000; // 5m
const START = Date.UTC(2026, 0, 1);

// Serie periódica: si el patrón se repite, los análogos deben reproducir la continuación
function sineCandles(count: number, period = 50): OHLCV[] {
  const price = (t: number) => 100 + 10 * Math.sin((2 * Math.PI * t) / period);
  return Array.from({ length: count }, (_, i) => {
    const open = price(i - 1);
    const close = price(i);
    return {
      timestamp: START + i * STEP,
      open,
      high: Math.max(open, close) + 0.1,
      low: Math.min(open, close) - 0.1,
      close,
      volume: 1000
    };
  });
}

function testForecast() {
  const all = sineCandles(1000);
  const history = all.slice(0, 900);
  const last = history[history.length - 1];

  const forecast = buildForecast(history, { baseTime: last.timestamp, stepMs: STEP, horizon: 12 });
  assert.ok(forecast, 'Debe generar una proyección');
  assert.strictEqual(forecast.method, 'analogs');
  assert.strictEqual(forecast.candles.length, 12);
  assert.ok(forecast.cases >= 8, 'Debe encontrar análogos');

  forecast.candles.forEach((c, i) => {
    // Velas coherentes
    assert.ok(c.high >= Math.max(c.open, c.close), `Vela ${i}: high por debajo del cuerpo`);
    assert.ok(c.low <= Math.min(c.open, c.close), `Vela ${i}: low por encima del cuerpo`);
    assert.ok([c.open, c.high, c.low, c.close].every(Number.isFinite), `Vela ${i}: valores no finitos`);
    // Tiempos consecutivos a partir de la vela base
    assert.strictEqual(new Date(c.time).getTime(), last.timestamp + (i + 1) * STEP);
    // Continúa la vela anterior
    const previousClose = i === 0 ? forecast.basePrice : forecast.candles[i - 1].close;
    assert.ok(Math.abs(c.open - previousClose) < 1e-9, `Vela ${i}: open no continúa el cierre anterior`);
    // Reproduce la continuación real de una serie periódica (error < 0,5%)
    const actual = all[900 + i].close;
    assert.ok(Math.abs(c.close - actual) / actual < 0.005, `Vela ${i}: ${c.close} frente a real ${actual}`);
  });

  forecast.bands.forEach((b, i) => {
    assert.ok(b.p10 <= b.p25 && b.p25 <= b.p50 && b.p50 <= b.p75 && b.p75 <= b.p90, `Banda ${i} desordenada`);
  });

  console.log(`✅ Análogos: ${forecast.cases} casos, ${forecast.upProbability?.toFixed(0)}% al alza`);
}

function testFallbacks() {
  // Historial corto: cono de volatilidad sin dirección
  const short = sineCandles(30);
  const last = short[short.length - 1];
  const cone = buildForecast(short, { baseTime: last.timestamp, stepMs: STEP, horizon: 6 });
  assert.ok(cone);
  assert.strictEqual(cone.method, 'volatility');
  assert.strictEqual(cone.upProbability, null);
  cone.bands.forEach((b, i) => {
    assert.strictEqual(b.p50, cone.basePrice);
    if (i > 0) assert.ok(b.p90 - b.p10 >= cone.bands[i - 1].p90 - cone.bands[i - 1].p10, 'El cono debe ensancharse');
  });

  // Datos insuficientes o precio base inválido
  assert.strictEqual(buildForecast(sineCandles(5), { baseTime: START, stepMs: STEP }), null);
  assert.strictEqual(buildForecast(sineCandles(200), { baseTime: START, stepMs: STEP, basePrice: 0 }), null);

  // El precio base desplaza la proyección
  const history = sineCandles(900);
  const base = history[history.length - 1];
  const shifted = buildForecast(history, { baseTime: base.timestamp, stepMs: STEP, basePrice: base.close * 2 });
  const normal = buildForecast(history, { baseTime: base.timestamp, stepMs: STEP });
  assert.ok(shifted && normal);
  assert.ok(Math.abs(shifted.candles[0].close / normal.candles[0].close - 2) < 1e-9);

  console.log('✅ Casos límite OK');
}

try {
  testForecast();
  testFallbacks();
} catch (error) {
  console.error('❌ Error:', error);
  process.exitCode = 1;
}
