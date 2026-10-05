/**
 * Análisis de Sentimiento basado en Noticias
 * Obtiene noticias de NewsAPI y analiza el sentimiento del mercado
 */

export interface NewsArticle {
  title: string;
  description: string;
  content: string;
  sentiment: number; // -1 a 1
  relevance: number; // 0 a 1
}

export interface SentimentResult {
  overallSentiment: number; // -1 (muy negativo) a 1 (muy positivo)
  confidence: number; // 0 a 100
  articlesAnalyzed: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  topKeywords: string[];
}

/**
 * Palabras clave positivas para crypto
 */
const POSITIVE_KEYWORDS = [
  'bullish', 'rally', 'surge', 'pump', 'gains', 'profit', 'bull',
  'adoption', 'partnership', 'institutional', 'upgrade', 'innovation',
  'breakthrough', 'growth', 'recovery', 'expansion', 'ath', 'record',
  'bull run', 'moon', 'lambo', 'bullish signal', 'positive', 'approval',
  'endorsement', 'integration', 'launch', 'mainnet', 'upgrade'
];

/**
 * Palabras clave negativas para crypto
 */
const NEGATIVE_KEYWORDS = [
  'bearish', 'crash', 'dump', 'plunge', 'loss', 'loss', 'bear',
  'regulation', 'ban', 'hack', 'exploit', 'scam', 'fraud',
  'bankruptcy', 'collapse', 'decline', 'drop', 'ath', 'sell-off',
  'bear market', 'bearish signal', 'negative', 'warning', 'risk',
  'delisting', 'downgrade', 'outage', 'security breach', 'fud'
];

/**
 * Analiza el sentimiento de un texto
 */
function analyzeSentiment(text: string): number {
  if (!text) return 0;

  const lowerText = text.toLowerCase();
  let positiveScore = 0;
  let negativeScore = 0;

  // Contar palabras positivas
  for (const keyword of POSITIVE_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      positiveScore += matches.length;
    }
  }

  // Contar palabras negativas
  for (const keyword of NEGATIVE_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = lowerText.match(regex);
    if (matches) {
      negativeScore += matches.length;
    }
  }

  // Calcular sentimiento normalizado (-1 a 1)
  const total = positiveScore + negativeScore;
  if (total === 0) return 0;

  return (positiveScore - negativeScore) / total;
}

/**
 * Extrae palabras clave de un texto
 */
function extractKeywords(text: string, limit: number = 5): string[] {
  const words = text
    .toLowerCase()
    .split(/\W+/)
    .filter(word => word.length > 4);

  // Filtrar palabras comunes
  const stopwords = new Set([
    'bitcoin', 'ethereum', 'crypto', 'market', 'trading', 'price',
    'said', 'says', 'said', 'report', 'reported', 'reports'
  ]);

  const filtered = words.filter(w => !stopwords.has(w));
  const unique = [...new Set(filtered)];

  return unique.slice(0, limit);
}

/**
 * Obtiene noticias de la API de NewsAPI
 */
async function fetchCryptoNews(symbol: string): Promise<NewsArticle[]> {
  try {
    const apiKey = process.env.NEWS_API_KEY;

    if (!apiKey) {
      console.log('⚠️  NEWS_API_KEY no configurada');
      return [];
    }

    // Mapear símbolo a términos de búsqueda
    const searchTerms: { [key: string]: string } = {
      'BTC/USDT': 'Bitcoin',
      'ETH/USDT': 'Ethereum',
      'BNB/USDT': 'Binance Coin',
      'SOL/USDT': 'Solana',
      'ADA/USDT': 'Cardano',
      'XRP/USDT': 'Ripple XRP',
      'DOGE/USDT': 'Dogecoin',
      'AVAX/USDT': 'Avalanche',
      'LTC/USDT': 'Litecoin',
      'LINK/USDT': 'Chainlink',
      'PAXG/USDT': 'Gold Crypto'
    };

    const searchTerm = searchTerms[symbol] || symbol;
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(searchTerm)}&sortBy=publishedAt&language=en&apiKey=${apiKey}`;

    const response = await fetch(url);
    const data = (await response.json()) as any;

    if (!data.articles || data.articles.length === 0) {
      return [];
    }

    // Procesar últimas 10 noticias
    return data.articles.slice(0, 10).map((article: any) => ({
      title: article.title,
      description: article.description || '',
      content: article.content || '',
      sentiment: analyzeSentiment(
        `${article.title} ${article.description} ${article.content}`
      ),
      relevance: 0.8 // Placeholder
    }));
  } catch (error) {
    console.error(`Error obteniendo noticias para ${symbol}:`, error);
    return [];
  }
}

/**
 * Analiza el sentimiento general del mercado para un símbolo
 */
export async function analyzeCryptoSentiment(symbol: string): Promise<SentimentResult> {
  try {
    const articles = await fetchCryptoNews(symbol);

    if (articles.length === 0) {
      return {
        overallSentiment: 0,
        confidence: 0,
        articlesAnalyzed: 0,
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        topKeywords: []
      };
    }

    // Calcular sentimiento promedio
    const sentiments = articles.map(a => a.sentiment);
    const overallSentiment = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;

    // Contar sentimientos
    const positiveCount = sentiments.filter(s => s > 0.1).length;
    const negativeCount = sentiments.filter(s => s < -0.1).length;
    const neutralCount = articles.length - positiveCount - negativeCount;

    // Calcular confianza basada en consistencia
    const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - overallSentiment, 2), 0) / sentiments.length;
    const confidence = Math.max(0, Math.min(100, 100 - (variance * 100)));

    // Extraer palabras clave
    const allText = articles
      .map(a => `${a.title} ${a.description} ${a.content}`)
      .join(' ');
    const topKeywords = extractKeywords(allText, 5);

    return {
      overallSentiment,
      confidence,
      articlesAnalyzed: articles.length,
      positiveCount,
      negativeCount,
      neutralCount,
      topKeywords
    };
  } catch (error) {
    console.error(`Error analizando sentimiento para ${symbol}:`, error);
    return {
      overallSentiment: 0,
      confidence: 0,
      articlesAnalyzed: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      topKeywords: []
    };
  }
}

/**
 * Obtiene ajuste de score basado en sentimiento
 * Devuelve un multiplicador para ajustar el score técnico
 */
export function getSentimentBoost(sentiment: SentimentResult): number {
  // Si no hay suficientes artículos, no ajustar
  if (sentiment.articlesAnalyzed < 2) return 1.0;

  // Multiplicador basado en sentimiento general
  const sentimentMultiplier = 1 + (sentiment.overallSentiment * 0.3); // ±30%

  // Factor de confianza - solo aplicar si es confiable
  const confidenceFactor = Math.min(1.0, sentiment.confidence / 80);

  return Math.max(0.7, Math.min(1.3, sentimentMultiplier * confidenceFactor));
}

/**
 * Genera mensaje de sentimiento para notificaciones
 */
export function getSentimentMessage(sentiment: SentimentResult): string {
  if (sentiment.articlesAnalyzed === 0) {
    return '📰 Sin noticias recientes';
  }

  const emoji = sentiment.overallSentiment > 0.2 ? '📈' :
                sentiment.overallSentiment < -0.2 ? '📉' : '➡️';

  const description = sentiment.overallSentiment > 0.3 ? 'muy positivo' :
                      sentiment.overallSentiment > 0.1 ? 'positivo' :
                      sentiment.overallSentiment < -0.3 ? 'muy negativo' :
                      sentiment.overallSentiment < -0.1 ? 'negativo' : 'neutro';

  return `${emoji} Sentimiento ${description} (${sentiment.articlesAnalyzed} noticias, confianza: ${sentiment.confidence.toFixed(0)}%)`;
}

export default {
  analyzeCryptoSentiment,
  getSentimentBoost,
  getSentimentMessage
};
