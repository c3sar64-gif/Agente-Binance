import { Pool, PoolClient } from 'pg';

/**
 * Gestión de conexión a Supabase PostgreSQL
 */
export class Database {
  private pool: Pool;
  private initialized: boolean = false;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL no configurado en .env');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5, // Supabase limita conexiones; agente + dashboard comparten pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: {
        rejectUnauthorized: false
      }
    });

    this.pool.on('error', (err) => {
      console.error('❌ Error en pool de conexiones:', err);
    });
  }

  /**
   * Inicializa las tablas en Supabase si no existen
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('🔧 Inicializando base de datos...');

      await this.query(`
        CREATE TABLE IF NOT EXISTS trades (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          side VARCHAR(10) NOT NULL,
          entry_price DECIMAL(20, 8) NOT NULL,
          exit_price DECIMAL(20, 8),
          quantity DECIMAL(20, 8) NOT NULL,
          pnl DECIMAL(20, 8),
          pnl_percent DECIMAL(10, 2),
          exit_reason VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          closed_at TIMESTAMP
        );
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS positions (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          side VARCHAR(10) NOT NULL,
          entry_price DECIMAL(20, 8) NOT NULL,
          quantity DECIMAL(20, 8) NOT NULL,
          risk_amount DECIMAL(20, 8) NOT NULL,
          stop_loss DECIMAL(20, 8) NOT NULL,
          take_profit DECIMAL(20, 8) NOT NULL,
          status VARCHAR(20) DEFAULT 'open',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          closed_at TIMESTAMP
        );
      `);

      await this.query(`
        CREATE TABLE IF NOT EXISTS statistics (
          id SERIAL PRIMARY KEY,
          date DATE DEFAULT CURRENT_DATE,
          total_trades INTEGER DEFAULT 0,
          winning_trades INTEGER DEFAULT 0,
          losing_trades INTEGER DEFAULT 0,
          win_rate DECIMAL(5, 2) DEFAULT 0,
          total_pnl DECIMAL(20, 8) DEFAULT 0,
          return_percent DECIMAL(10, 2) DEFAULT 0,
          max_daily_loss DECIMAL(20, 8) DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date)
        );
      `);

      // Crear índices para mejores búsquedas
      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
      `);

      // Los listados del dashboard ordenan por closed_at
      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_trades_closed_at ON trades(closed_at DESC);
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol);
      `);

      await this.query(`
        CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
      `);

      this.initialized = true;
      console.log('✅ Base de datos inicializada correctamente\n');

    } catch (error) {
      console.error('❌ Error inicializando base de datos:', error);
      throw error;
    }
  }

  /**
   * Ejecuta una consulta SQL
   */
  async query(text: string, values?: any[]): Promise<any> {
    try {
      const result = await this.pool.query(text, values);
      return result;
    } catch (error) {
      console.error('❌ Error ejecutando query:', error);
      throw error;
    }
  }

  /**
   * Obtiene un cliente para transacciones
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Cierra la conexión
   */
  async close(): Promise<void> {
    await this.pool.end();
    console.log('🔌 Conexión a base de datos cerrada');
  }

  /**
   * Comprueba la conexión
   */
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      console.log('✅ Conexión a Supabase exitosa');
      return true;
    } catch (error) {
      console.error('❌ Error conectando a Supabase:', error);
      return false;
    }
  }
}

// Instancia global
let dbInstance: Database | null = null;

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = new Database();
  }
  return dbInstance;
}

export default Database;
