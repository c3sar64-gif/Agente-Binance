# Agente BinanceMaster 🤖

Agente de trading autónomo especializado en criptomonedas. Operas en **Binance Testnet** y **Bybit Demo** con análisis técnico, gestión estricta de riesgo y aprendizaje continuo.

## 📋 Estado del Proyecto

### ✅ Completado
- [x] Configuración del entorno (.env, variables)
- [x] Clientes CCXT para Binance Testnet y Bybit Demo
- [x] Estructura base del proyecto
- [x] Scripts de prueba de conexión

### 🔄 En Desarrollo
- [ ] Indicadores técnicos (RSI, MACD, BB, EMA, Volumen)
- [ ] Sistema de scoring de señales
- [ ] Gestor de riesgo
- [ ] Ejecutor de órdenes
- [ ] Loop principal del agente
- [ ] Bot de Telegram
- [ ] Base de datos SQLite para logging

## 🚀 Quick Start

### 1. Instalar dependencias
```bash
npm install
```

### 2. Verificar archivo .env
```bash
# El archivo .env debe contener:
BINANCE_API_KEY=tu_key
BINANCE_API_SECRET=tu_secret
BINANCE_TESTNET=true

TELEGRAM_BOT_TOKEN=tu_token
TELEGRAM_ALLOWED_USER_IDS=tu_id
```

### 3. Probar conexiones
```bash
npm run test
```

Deberías ver algo como:
```
🔍 Testeando conexiones...

📊 BINANCE TESTNET
────────────────────────────────────────
✅ Binance Testnet conectado
   BTC: $45000

Saldos principales:
  USDT: 10000 (Total: 10000)
  BTC: 0.5 (Total: 0.5)

Precio actual BTC/USDT: $45000
```

## 📁 Estructura del Proyecto

```
Agente-BinanceMaster/
├── Skills/                          # Documentación y prompts
│   ├── Superpowers.md
│   ├── Agente-Trading-Autonomo.md
│   └── prompts/
│       └── personality.prompt.ts
├── src/
│   ├── config/
│   │   ├── env.ts                  # Validación de variables de entorno
│   │   ├── binance.ts              # Cliente Binance Testnet
│   │   └── bybit.ts                # Cliente Bybit Demo
│   ├── analysis/                   # 🔄 Indicadores técnicos (próximo)
│   │   ├── indicators.ts
│   │   ├── sentiment.ts
│   │   ├── market-regime.ts
│   │   └── scorer.ts
│   ├── trading/                    # 🔄 Lógica de trading (próximo)
│   │   ├── executor.ts
│   │   ├── risk-manager.ts
│   │   ├── position-manager.ts
│   │   └── strategies.ts
│   ├── data/                       # 🔄 Gestión de datos (próximo)
│   ├── memory/                     # 🔄 SQLite y logging (próximo)
│   ├── notifications/              # 🔄 Telegram Bot (próximo)
│   ├── scheduler/                  # 🔄 Tareas automáticas (próximo)
│   ├── __tests__/
│   │   └── connection.test.ts      # Test de conexiones
│   └── agent.ts                    # 🔄 Loop principal (próximo)
├── .env                            # Variables de entorno (secretas)
├── .gitignore                      # Archivos a ignorar en git
├── package.json                    # Dependencias
├── tsconfig.json                   # Configuración TypeScript
└── README.md                       # Este archivo
```

## 🔑 Variables de Entorno Requeridas

### Binance
```
BINANCE_API_KEY=              # Tu API Key de Binance Testnet
BINANCE_API_SECRET=           # Tu API Secret
BINANCE_TESTNET=true          # Usar testnet
BINANCE_BASE_URL=https://testnet.binance.vision
```

### Bybit (Opcional)
```
BYBIT_API_KEY=                # Tu API Key de Bybit Demo
BYBIT_API_SECRET=             # Tu API Secret
BYBIT_TESTNET=true
```

### Telegram
```
TELEGRAM_BOT_TOKEN=           # Token de tu bot (@BotFather)
TELEGRAM_ALLOWED_USER_IDS=    # Tu User ID (puede ser múltiple, separado por comas)
```

### Otras
```
NEWS_API_KEY=                 # Para análisis de noticias (opcional, https://newsapi.org)
DB_PATH=./trading.db          # Ruta de base de datos SQLite
LOG_LEVEL=debug               # debug|info|warn|error
```

## 📚 APIs y Librerías

- **CCXT** - Conexión unificada con exchanges
- **better-sqlite3** - Base de datos local
- **grammy** - Bot de Telegram
- **technicalindicators** - Indicadores técnicos
- **node-cron** - Scheduler de tareas
- **axios** - HTTP requests

## ⚠️ Notas de Seguridad

- **NUNCA** hardcodees credenciales en el código
- **NUNCA** compartas tu `.env`
- Regenera las credenciales después de terminar las pruebas
- El `.env` está en `.gitignore` por seguridad
- Usa testnet/demo antes de pasar a cuenta real

## 🔄 Próximos Pasos

1. **Indicadores técnicos** - Implementar RSI, MACD, Bollinger Bands, EMA, Volumen
2. **Sistema de scoring** - Confirmar señales con múltiples indicadores
3. **Gestor de riesgo** - Calcular tamaño de posición automáticamente
4. **Ejecutor de órdenes** - Colocar órdenes límite en Binance y Bybit
5. **Bot de Telegram** - Notificaciones en tiempo real
6. **Loop principal** - Ejecutar el agente continuamente

## 📝 License

MIT

## 👨‍💻 Desarrollo

Para desarrollo local:
```bash
# Modo watch (recompila automáticamente)
npm run dev

# Build
npm run build

# Ejecutar
npm run start
```

---

**Última actualización:** Marzo 2026
