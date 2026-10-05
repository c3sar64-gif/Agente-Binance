import { Database, getDatabase } from './database';
import { computePnl } from '../trading/risk-manager';

/**
 * Interface para posiciones
 */
export interface Position {
  id?: number;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  riskAmount: number;
  stopLoss: number;
  takeProfit: number;
  status?: 'open' | 'closed';
  timestamp: number;
  exitReason?: string;
}

/**
 * Gestiona el guardado de trades y posiciones en Supabase
 */
export class TradeLogger {
  private db: Database;

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Inicializa la base de datos
   */
  async initialize(): Promise<void> {
    await this.db.initialize();
  }

  /**
   * Guarda una posición abierta
   */
  async savePosition(position: Position): Promise<number | null> {
    try {
      const result = await this.db.query(
        `INSERT INTO positions (symbol, side, entry_price, quantity, risk_amount, stop_loss, take_profit, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          position.symbol,
          position.side,
          position.entryPrice,
          position.quantity,
          position.riskAmount,
          position.stopLoss,
          position.takeProfit,
          'open',
          new Date(position.timestamp)
        ]
      );

      return result.rows[0]?.id || null;
    } catch (error) {
      console.error('❌ Error guardando posición:', error);
      return null;
    }
  }

  /**
   * Cierra una posición y guarda el trade resultante
   */
  async closeTrade(
    symbol: string,
    side: 'buy' | 'sell',
    entryPrice: number,
    exitPrice: number,
    quantity: number,
    exitReason?: string
  ): Promise<boolean> {
    let client;
    try {
      client = await this.db.getClient();
    } catch (error) {
      console.error('❌ Error obteniendo conexión para cerrar trade:', error);
      return false;
    }

    try {
      const pnl = computePnl(side, entryPrice, exitPrice, quantity);
      const pnlPercent = (pnl / (entryPrice * quantity)) * 100;

      // Ambas escrituras en una transacción: o se guardan las dos o ninguna
      await client.query('BEGIN');

      // Guardar el trade cerrado
      await client.query(
        `INSERT INTO trades (symbol, side, entry_price, exit_price, quantity, pnl, pnl_percent, exit_reason, closed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          symbol,
          side,
          entryPrice,
          exitPrice,
          quantity,
          pnl,
          pnlPercent,
          exitReason || 'normal',
          new Date()
        ]
      );

      // Actualizar la posición a cerrada (Postgres no admite ORDER BY/LIMIT en UPDATE)
      await client.query(
        `UPDATE positions SET status = $1, closed_at = $2
         WHERE id = (
           SELECT id FROM positions
           WHERE symbol = $3 AND side = $4 AND status = $5
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        ['closed', new Date(), symbol, side, 'open']
      );

      await client.query('COMMIT');
      client.release();
      return true;
    } catch (error) {
      let rollbackError: Error | undefined;
      await client.query('ROLLBACK').catch((err: Error) => { rollbackError = err; });
      console.error('❌ Error cerrando trade:', error);
      // Si el ROLLBACK falla, la conexión está rota: destruirla en vez de devolverla al pool
      client.release(rollbackError);
      return false;
    }
  }

  /**
   * Obtiene todos los trades cerrados
   */
  async getAllTrades(limit: number = 50): Promise<Position[]> {
    try {
      const result = await this.db.query(
        `SELECT
          id,
          symbol,
          side,
          entry_price as "entryPrice",
          exit_price as "exitPrice",
          quantity,
          pnl,
          pnl_percent as "pnlPercent",
          exit_reason as "exitReason",
          closed_at as "timestamp"
         FROM trades
         ORDER BY closed_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      console.error('❌ Error obteniendo trades:', error);
      return [];
    }
  }

  /**
   * Obtiene todas las posiciones abiertas
   */
  async getOpenPositions(): Promise<Position[]> {
    try {
      const result = await this.db.query(
        `SELECT
          id,
          symbol,
          side,
          entry_price as "entryPrice",
          quantity,
          risk_amount as "riskAmount",
          stop_loss as "stopLoss",
          take_profit as "takeProfit",
          status,
          created_at as "timestamp"
         FROM positions
         WHERE status = 'open'
         ORDER BY created_at DESC`
      );

      return result.rows;
    } catch (error) {
      console.error('❌ Error obteniendo posiciones abiertas:', error);
      return [];
    }
  }

  /**
   * Obtiene estadísticas del día
   */
  async getDailyStats(): Promise<any> {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total_trades,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
          SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(AVG(pnl_percent), 0) as avg_pnl_percent
         FROM trades
         WHERE DATE(closed_at) = CURRENT_DATE`
      );

      const row = result.rows[0];
      const totalTrades = parseInt(row.total_trades) || 0;
      const winningTrades = parseInt(row.winning_trades) || 0;
      const losingTrades = parseInt(row.losing_trades) || 0;
      const totalPnL = parseFloat(row.total_pnl) || 0;
      const avgPnlPercent = parseFloat(row.avg_pnl_percent) || 0;

      return {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        totalPnL,
        avgPnlPercent
      };
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0,
        avgPnlPercent: 0
      };
    }
  }

  /**
   * Obtiene estadísticas generales de todos los tiempos
   */
  async getOverallStats(): Promise<any> {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(*) as total_trades,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
          SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
          COALESCE(SUM(pnl), 0) as total_pnl
         FROM trades
         WHERE closed_at IS NOT NULL`
      );

      const row = result.rows[0];
      const totalTrades = parseInt(row.total_trades) || 0;
      const winningTrades = parseInt(row.winning_trades) || 0;
      const losingTrades = parseInt(row.losing_trades) || 0;
      const totalPnL = parseFloat(row.total_pnl) || 0;

      return {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        totalPnL
      };
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas generales:', error);
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0
      };
    }
  }

  /**
   * Obtiene trades por símbolo
   */
  async getTradesBySymbol(symbol: string, limit: number = 50): Promise<Position[]> {
    try {
      const result = await this.db.query(
        `SELECT
          id,
          symbol,
          side,
          entry_price as "entryPrice",
          exit_price as "exitPrice",
          quantity,
          pnl,
          pnl_percent as "pnlPercent",
          exit_reason as "exitReason",
          closed_at as "timestamp"
         FROM trades
         WHERE symbol = $1
         ORDER BY closed_at DESC
         LIMIT $2`,
        [symbol, limit]
      );

      return result.rows;
    } catch (error) {
      console.error(`❌ Error obteniendo trades de ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Cierra la conexión
   */
  async close(): Promise<void> {
    await this.db.close();
  }
}

// Instancia global
let loggerInstance: TradeLogger | null = null;

export function getTradeLogger(): TradeLogger {
  if (!loggerInstance) {
    loggerInstance = new TradeLogger();
  }
  return loggerInstance;
}

export default TradeLogger;
