# Ejecutar el Agente BinanceMaster

## Requisitos Previos

1. ✅ Credenciales configuradas en `.env`
2. ✅ Dependencias instaladas: `npm install`
3. ✅ Testnet de Binance activo
4. ✅ Bot de Telegram configurado

## Verificar Configuración

Antes de ejecutar el agente, verifica que todo funciona:

```bash
# Test de conexión
npm run test

# Test de indicadores
npm run test:indicators

# Test de scoring
npm run test:scorer

# Test de riesgo
npm run test:risk

# Test de ejecutor
npm run test:executor

# Test de Telegram
npm run test:telegram
```

## Ejecutar el Agente

### Modo Desarrollo (con reload automático)
```bash
npm run dev
```

Este modo:
- Escanea cada 30 segundos
- Recarga automáticamente si cambias código
- Muestra logs detallados

### Modo Producción (compilar + ejecutar)
```bash
npm run build
npm start
```

Este modo:
- Escanea cada 5 minutos (real)
- Optimizado para ejecución 24/7
- Menor consumo de recursos

## Qué Sucede al Iniciar

```
🤖 INICIANDO AGENTE BINANCEMASTER
════════════════════════════════════════════════════════════════════════════════

📡 Verificando conexión a Binance Testnet...
✅ Conexión establecida

🔗 Conectando bot de Telegram...
✅ Bot de Telegram conectado

📊 Buenos días — Análisis de mercado [fecha]
- BTC: $70,500 [+2.5%]
- Régimen: BULLISH
- Señales activas: 0

🔄 Loop principal iniciado

Symbols a monitorear: BTC/USDT, ETH/USDT
Intervalo de escaneo: 5 minutos (producción) / 30 segundos (desarrollo)
Capital inicial: $10,000

Presiona CTRL+C para detener el agente
```

## Loop Principal (cada 5 minutos)

El agente realiza en cada ciclo:

```
⏰ Escaneo: 10:30:45

📈 BTC/USDT
  Precio: $70,500.00
  Régimen: BULLISH (68/100)
  Señal: HOLD | Score: 5.8/10 | Confianza: 50%
  ⚪ Señal débil - esperando mayor confianza

📈 ETH/USDT
  Precio: $3,800.00
  Régimen: BULLISH (72/100)
  Señal: BUY | Score: 7.5/10 | Confianza: 78%
  ✅ Señal ejecutable detectada

════════════════════════════════════════════════════════════════════════════════
🟢 ORDEN BUY EJECUTADA

Símbolo: ETH/USDT
Precio: $3,800.00
Cantidad: 0.789 ETH
Stop-Loss: $3,772.50
Take-Profit: $3,852.50
Score: 7.5/10

════════════════════════════════════════════════════════════════════════════════

📊 Resumen: 1 posiciones abiertas | Capital disponible: $7,500.00
```

## Notificaciones de Telegram

Durante la ejecución, recibirás notificaciones:

- 🟢 **Orden ejecutada**: cuando se abre una posición
- 🔴 **Posición cerrada**: con P&L y razón
- 📊 **Informe matutino**: cada mañana a las 06:00
- 📈 **Informe diario**: cada noche a las 22:00
- 🚨 **Alerta de límite**: si se alcanza límite diario/semanal
- 📰 **Noticia importante**: si hay evento de riesgo
- ⚠️ **Error crítico**: si algo falla

## Comandos Disponibles (vía Telegram)

Mientras el agente está corriendo:

- `/status` - Ver estado actual y posiciones
- `/pause` - Pausar nuevas operaciones
- `/resume` - Reanudar operaciones
- `/close_all` - Cerrar todas las posiciones
- `/report` - Generar informe manual
- `/help` - Ver ayuda

## Detener el Agente

```bash
# Presionar CTRL+C
# El agente:
# 1. Cierra todas las posiciones
# 2. Genera informe final
# 3. Se detiene limpiamente
```

## Monitoreo

### Ver estado en tiempo real
```bash
# En otra terminal
tail -f output.log
```

### Ver logs de errores
```bash
tail -f error.log
```

## Troubleshooting

### Error: "Cannot find module 'ccxt'"
```bash
npm install
```

### Error: "Conexión rechazada a Binance"
- Verificar que el testnet está activo
- Verificar credenciales en `.env`
- Verificar conexión a internet

### Error: "Bot de Telegram no conecta"
- Verificar que `TELEGRAM_BOT_TOKEN` es válido
- Verificar que `TELEGRAM_ALLOWED_USER_IDS` es correcto
- Iniciar una conversación con el bot (@BotFather)

### Error: "Capital insuficiente"
- Aumentar `initialCapital` en `agent.ts`
- El agente es conservador con el capital

## Configuración Avanzada

### Cambiar símbolos a monitorear

En `agent.ts`, línea ~55:
```typescript
private symbols: string[] = ['BTC/USDT', 'ETH/USDT'];
```

Ejemplo:
```typescript
private symbols: string[] = ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT'];
```

### Cambiar intervalo de escaneo

En `agent.ts`, método `startScanLoop()`:
```typescript
const interval = 30 * 1000; // 30 segundos (desarrollo)
```

Cambiar a:
```typescript
const interval = 5 * 60 * 1000; // 5 minutos (producción)
```

### Cambiar límites de riesgo

En `risk-manager.ts`:
```typescript
maxRiskPerTrade: this.totalCapital * 0.03,  // 3% por trade
maxDailyLoss: this.totalCapital * 0.09,     // 9% diario
maxWeeklyLoss: this.totalCapital * 0.15     // 15% semanal
```

## Logs Esperados

### Trading normal
```
✅ Conexión establecida
✅ Señal ejecutada
✅ Posición registrada
```

### Advertencias (normales)
```
⚠️ Señal débil - esperando mayor confianza
⚠️ Capital insuficiente para más posiciones
⚠️ Límite de posiciones alcanzado (5/5)
```

### Errores
```
❌ Conexión fallida
❌ Error en validación
❌ Error crítico del sistema
```

---

**¡El agente está listo para operar en Binance Testnet!** 🚀
