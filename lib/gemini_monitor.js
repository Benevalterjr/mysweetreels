import fs from 'fs';
import path from 'path';

const USAGE_FILE = path.join('data', 'gemini_usage.json');
const PUBLIC_USAGE_FILE = path.join('public', 'data', 'gemini_usage.json');

// Limites oficiais do Google AI Studio (Gemini 2.5 Flash Free Tier)
export const GEMINI_LIMITS = {
  MAX_RPM: 15,          // 15 requisições por minuto
  SAFETY_RPM: 12,       // Margem de segurança (desacelera aos 12)
  MAX_RPD: 1500,        // 1.500 requisições por dia
  MAX_TPM: 1000000      // 1 milhão de tokens por minuto
};

class GeminiMonitor {
  constructor() {
    this.data = this.loadUsage();
  }

  loadUsage() {
    try {
      if (fs.existsSync(USAGE_FILE)) {
        return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
      }
    } catch (e) {
      console.warn('Erro ao carregar gemini_usage.json, iniciando novo:', e.message);
    }
    return {
      history: [],
      daily_totals: {}
    };
  }

  save() {
    try {
      if (!fs.existsSync('data')) fs.mkdirSync('data', { recursive: true });
      if (!fs.existsSync(path.join('public', 'data'))) fs.mkdirSync(path.join('public', 'data'), { recursive: true });

      const jsonStr = JSON.stringify(this.data, null, 2);
      fs.writeFileSync(USAGE_FILE, jsonStr);
      fs.writeFileSync(PUBLIC_USAGE_FILE, jsonStr);
    } catch (e) {
      console.error('Erro ao salvar telemetria do Gemini:', e);
    }
  }

  getTodayKey() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  getRecentRequests(windowMs = 60000) {
    const now = Date.now();
    return this.data.history.filter(h => (now - new Date(h.timestamp).getTime()) < windowMs);
  }

  async checkRateLimitsAndThrottle() {
    const now = Date.now();
    const today = this.getTodayKey();
    const dayStats = this.data.daily_totals[today] || { requests: 0, total_tokens: 0 };

    // 1. Verificação de Limite Diário (RPD)
    if (dayStats.requests >= GEMINI_LIMITS.MAX_RPD) {
      throw new Error(`🚫 LIMITE DIÁRIO DO GEMINI ATINGIDO: ${dayStats.requests}/${GEMINI_LIMITS.MAX_RPD} requisições hoje. Aguarde o reset da cota à meia-noite UTC.`);
    }

    // 2. Verificação de Requisições por Minuto (RPM)
    const recent = this.getRecentRequests(60000);
    console.log(`📊 [Monitor Gemini] Uso no último minuto: ${recent.length}/${GEMINI_LIMITS.MAX_RPM} RPM | Hoje: ${dayStats.requests}/${GEMINI_LIMITS.MAX_RPD} RPD`);

    // Se estiver se aproximando do teto por minuto, aplica pausa inteligente
    if (recent.length >= GEMINI_LIMITS.SAFETY_RPM) {
      const oldestInWindow = new Date(recent[0].timestamp).getTime();
      const waitMs = Math.max(1000, 60000 - (now - oldestInWindow) + 1000);
      console.warn(`⏳ [Rate Limit Proativo] Atingido limiar de segurança (${recent.length} req/min). Aguardando ${(waitMs / 1000).toFixed(1)}s para evitar bloqueio da Google...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  recordSuccess({ reelId, promptTokens = 0, candidatesTokens = 0, totalTokens = 0, latencyMs = 0, model = 'gemini-2.5-flash' }) {
    const timestamp = new Date().toISOString();
    const today = this.getTodayKey();

    if (!this.data.daily_totals[today]) {
      this.data.daily_totals[today] = {
        date: today,
        requests: 0,
        prompt_tokens: 0,
        candidates_tokens: 0,
        total_tokens: 0
      };
    }

    const day = this.data.daily_totals[today];
    day.requests += 1;
    day.prompt_tokens += promptTokens;
    day.candidates_tokens += candidatesTokens;
    day.total_tokens += totalTokens;

    const entry = {
      id: reelId,
      timestamp,
      model,
      status: 'SUCCESS',
      prompt_tokens: promptTokens,
      candidates_tokens: candidatesTokens,
      total_tokens: totalTokens,
      latency_ms: latencyMs
    };

    this.data.history.unshift(entry);
    // Guarda histórico dos últimos 500 registros para não inchar o arquivo
    if (this.data.history.length > 500) {
      this.data.history = this.data.history.slice(0, 500);
    }

    this.save();
    console.log(`✅ [Monitor Gemini] Requisição registrada! Tokens: ${totalTokens} | Tempo: ${latencyMs}ms | Cota diária usada: ${day.requests}/${GEMINI_LIMITS.MAX_RPD} (${((day.requests / GEMINI_LIMITS.MAX_RPD) * 100).toFixed(2)}%)`);
  }

  recordFailure({ reelId, error, latencyMs = 0, model = 'gemini-2.5-flash' }) {
    const timestamp = new Date().toISOString();
    const entry = {
      id: reelId,
      timestamp,
      model,
      status: 'FAILED',
      error: error.message || String(error),
      latency_ms: latencyMs
    };
    this.data.history.unshift(entry);
    this.save();
    console.error(`❌ [Monitor Gemini] Erro registrado para o Reels ${reelId}:`, error.message);
  }

  getDashboardStats() {
    const today = this.getTodayKey();
    const day = this.data.daily_totals[today] || { requests: 0, total_tokens: 0, prompt_tokens: 0, candidates_tokens: 0 };
    const recent = this.getRecentRequests(60000);

    const rpmPercent = Math.min(100, (recent.length / GEMINI_LIMITS.MAX_RPM) * 100);
    const rpdPercent = Math.min(100, (day.requests / GEMINI_LIMITS.MAX_RPD) * 100);

    let status = 'HEALTHY';
    let statusText = 'Normal & Saudável';
    if (recent.length >= GEMINI_LIMITS.SAFETY_RPM || rpdPercent > 80) {
      status = 'WARNING';
      statusText = 'Atenção (Uso Alto)';
    }
    if (day.requests >= GEMINI_LIMITS.MAX_RPD) {
      status = 'LIMIT_REACHED';
      statusText = 'Limite Diário Atingido';
    }

    return {
      status,
      status_text: statusText,
      limits: GEMINI_LIMITS,
      today: {
        date: today,
        requests_count: day.requests,
        requests_limit: GEMINI_LIMITS.MAX_RPD,
        requests_percentage: Number(rpdPercent.toFixed(1)),
        total_tokens: day.total_tokens
      },
      current_minute: {
        requests_count: recent.length,
        requests_limit: GEMINI_LIMITS.MAX_RPM,
        requests_percentage: Number(rpmPercent.toFixed(1))
      },
      recent_calls: this.data.history.slice(0, 10)
    };
  }
}

export const monitor = new GeminiMonitor();
