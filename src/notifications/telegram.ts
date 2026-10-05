import { Bot, Context } from 'grammy';
import { getEnvConfig } from '../config/env';
import { RiskManager, Position } from '../trading/risk-manager';
import { MarketRegimeAnalysis } from '../analysis/market-regime';
import { SignalScore } from '../analysis/scorer';

/**
 * Notificaciones por Telegram
 */
export class TelegramNotifier {
  private bot: Bot;
  private config: ReturnType<typeof getEnvConfig>;
  private isConnected: boolean = false;

  constructor() {
    this.config = getEnvConfig();
    this.bot = new Bot(this.config.telegramBotToken);

    // Configurar handlers
    this.setupHandlers();
  }

  /**
   * Configura los handlers de comandos
   */
  private setupHandlers() {
    // Solo los usuarios autorizados pueden usar comandos del bot
    const allowedIds = new Set(this.config.telegramAllowedUserIds);
    this.bot.use(async (ctx, next) => {
      if (!ctx.from || !allowedIds.has(ctx.from.id)) return;
      await next();
    });

    // Comando /start
    this.bot.command('start', async (ctx: Context) => {
      await ctx.reply(
        '🤖 *Agente BinanceMaster Iniciado*\n\n' +
        'Comandos disponibles:\n' +
        '/status - Estado actual\n' +
        '/pause - Pausar operaciones\n' +
        '/resume - Reanudar operaciones\n' +
        '/close\\_all - Cerrar todas las posiciones\n' +
        '/report - Generar informe\n' +
        '/help - Ayuda',
        { parse_mode: 'Markdown' }
      );
    });

    // Comando /status
    this.bot.command('status', async (ctx: Context) => {
      await ctx.reply('📊 Estado del agente\n\nEste comando se actualizará cuando el agente esté corriendo.');
    });

    // Comando /help
    this.bot.command('help', async (ctx: Context) => {
      await ctx.reply(
        '🆘 *Ayuda - Comandos Disponibles*\n\n' +
        '/status - Ver estado actual y posiciones\n' +
        '/pause - Pausar nuevas operaciones\n' +
        '/resume - Reanudar operaciones\n' +
        '/close\\_all - Cerrar todas las posiciones inmediatamente\n' +
        '/report - Generar informe de hoy\n' +
        '/stats - Ver estadísticas\n\n' +
        '💡 El agente enviará notificaciones automáticamente cuando ejecute operaciones.',
        { parse_mode: 'Markdown' }
      );
    });
  }

  /**
   * Conecta el bot
   */
  async connect(): Promise<boolean> {
    try {
      console.log('🔗 Conectando bot de Telegram...');

      // En testnet, no podemos usar webhooks, así que usamos polling
      // this.bot.start({ allowed_updates: ['message', 'callback_query'] });

      console.log('✅ Bot de Telegram conectado');
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('❌ Error conectando bot:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Envía notificación de orden ejecutada
   */
  async notifyOrderExecuted(
    symbol: string,
    side: 'buy' | 'sell',
    price: number,
    quantity: number,
    stopLoss: number,
    takeProfit: number,
    score: number
  ): Promise<void> {
    if (!this.isConnected) return;

    const emoji = side === 'buy' ? '🟢' : '🔴';
    const message =
      `${emoji} *ORDEN ${side.toUpperCase()} EJECUTADA*\n\n` +
      `Símbolo: ${symbol}\n` +
      `Precio: $${price.toFixed(2)}\n` +
      `Cantidad: ${quantity.toFixed(6)}\n` +
      `Stop-Loss: $${stopLoss.toFixed(2)}\n` +
      `Take-Profit: $${takeProfit.toFixed(2)}\n` +
      `Score de confianza: ${score.toFixed(1)}/10`;

    await this.sendMessage(message);
  }

  /**
   * Envía notificación de posición cerrada
   */
  async notifyPositionClosed(
    position: Position,
    pnl: number,
    pnlPercent: number
  ): Promise<void> {
    if (!this.isConnected) return;

    const emoji = pnl >= 0 ? '✅' : '❌';
    const message =
      `${emoji} *POSICIÓN CERRADA*\n\n` +
      `Símbolo: ${position.symbol}\n` +
      `Lado: ${position.side.toUpperCase()}\n` +
      `Entrada: $${position.entryPrice.toFixed(2)}\n` +
      `Salida: $${(position.exitPrice || 0).toFixed(2)}\n` +
      `P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)\n` +
      `Razón: ${position.exitReason || 'manual'}`;

    await this.sendMessage(message);
  }

  /**
   * Envía alerta de límite diario alcanzado
   */
  async notifyDailyLimitReached(dailyLoss: number, maxDaily: number): Promise<void> {
    if (!this.isConnected) return;

    const message =
      `🚨 *LÍMITE DIARIO ALCANZADO*\n\n` +
      `Pérdida del día: $${dailyLoss.toFixed(2)}\n` +
      `Límite: $${maxDaily.toFixed(2)}\n\n` +
      `El agente se ha pausado automáticamente.`;

    await this.sendMessage(message);
  }

  /**
   * Envía informe matutino
   */
  async sendMorningReport(
    btcPrice: number,
    marketRegime: MarketRegimeAnalysis,
    activeSignals: number
  ): Promise<void> {
    if (!this.isConnected) return;

    const date = new Date().toLocaleDateString('es-ES');
    const message =
      `📊 *INFORME MATUTINO* - ${date}\n\n` +
      `BTC: $${btcPrice.toFixed(2)}\n` +
      `Régimen: ${marketRegime.regime.toUpperCase()}\n` +
      `Fuerza: ${marketRegime.strength.toFixed(0)}/100\n` +
      `Volatilidad: ${marketRegime.volatility?.toFixed(2) || 'N/A'}%\n` +
      `Confianza: ${marketRegime.confidence}%\n\n` +
      `Señales activas: ${activeSignals}\n` +
      `Estado: ✅ Activo`;

    await this.sendMessage(message);
  }

  /**
   * Envía informe diario
   */
  async sendDailyReport(
    riskManager: RiskManager
  ): Promise<void> {
    if (!this.isConnected) return;

    const stats = riskManager.getStats();
    const state = riskManager.getState();
    const date = new Date().toLocaleDateString('es-ES');

    const message =
      `📈 *INFORME DIARIO* - ${date}\n\n` +
      `Operaciones: ${stats.totalTrades}\n` +
      `Ganadoras: ${stats.winningTrades} (${stats.winRate.toFixed(1)}%)\n` +
      `Perdedoras: ${stats.losingTrades}\n` +
      `P&L Total: ${stats.totalPnL >= 0 ? '+' : ''}$${stats.totalPnL.toFixed(2)}\n` +
      `Return: ${stats.returnPercent >= 0 ? '+' : ''}${stats.returnPercent.toFixed(2)}%\n\n` +
      `Capital: $${state.totalCapital.toFixed(2)}\n` +
      `Disponible: $${state.availableCapital.toFixed(2)}\n` +
      `Posiciones abiertas: ${state.openPositions}\n` +
      `Pérdida del día: $${state.dailyLoss.toFixed(2)}`;

    await this.sendMessage(message);
  }

  /**
   * Envía noticia importante
   */
  async notifyImportantNews(headline: string, impact: string): Promise<void> {
    if (!this.isConnected) return;

    const message =
      `📰 *NOTICIA IMPORTANTE*\n\n` +
      `${headline}\n\n` +
      `Impacto: ${impact}\n` +
      `Acción: Revisar señales activas`;

    await this.sendMessage(message);
  }

  /**
   * Envía notificación de error crítico
   */
  async notifyError(error: string): Promise<void> {
    if (!this.isConnected) return;

    const message =
      `⚠️ *ERROR CRÍTICO*\n\n` +
      `${error}\n\n` +
      `Por favor revisa el agente inmediatamente.`;

    await this.sendMessage(message);
  }

  /**
   * Envía mensaje genérico
   */
  private async sendMessage(message: string): Promise<void> {
    // Cada destinatario por separado: un fallo no impide avisar al resto
    for (const userId of this.config.telegramAllowedUserIds) {
      try {
        await this.bot.api.sendMessage(userId, message, {
          parse_mode: 'Markdown'
        });
      } catch (error) {
        // Texto con caracteres Markdown sin escapar (p. ej. "_" en errores): reintentar en texto plano
        try {
          await this.bot.api.sendMessage(userId, message);
        } catch (plainError) {
          console.error(`Error enviando mensaje por Telegram a ${userId}:`, plainError);
        }
      }
    }
  }

  /**
   * Obtiene si está conectado
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Inicia el bot (polling)
   */
  async start(): Promise<void> {
    try {
      console.log('🤖 Iniciando bot de Telegram...');
      // Usar polling para testnet
      await this.bot.start({ allowed_updates: ['message', 'callback_query'] });
      console.log('✅ Bot escuchando comandos');
    } catch (error) {
      console.error('Error iniciando bot:', error);
    }
  }

  /**
   * Detiene el bot
   */
  stop(): void {
    this.bot.stop();
    this.isConnected = false;
  }
}

export default TelegramNotifier;
