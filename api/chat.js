// ==============================
// RATE LIMIT + CACHE
// ==============================
const requests = new Map();
const cache = new Map();

const CACHE_TTL = 1000 * 60 * 5; // 5 minutos
const CACHE_LIMIT = 50;

function rateLimit(ip) {
  const now = Date.now();
  const windowTime = 15 * 60 * 1000;
  const limit = 10;

  if (!requests.has(ip)) {
    requests.set(ip, []);
  }

  const timestamps = requests.get(ip).filter(t => now - t < windowTime);
  timestamps.push(now);
  requests.set(ip, timestamps);

  return timestamps.length <= limit;
}

// 🔥 normaliza texto (melhora cache)
function normalizarTexto(texto) {
  return texto.toLowerCase().trim();
}

// ==============================
// HANDLER
// ==============================
export default async function handler(req, res) {

  // GET (teste)
  if (req.method === "GET") {
    return res.status(200).json({ status: "API online 🚀" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";

  // RATE LIMIT
  if (!rateLimit(ip)) {
    return res.status(429).json({
      resposta: "Muitas requisições. Tente novamente em alguns minutos."
    });
  }

  // ==============================
  // BODY SAFE PARSE
  // ==============================
  let body;
  try {
    body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;
  } catch {
    body = {};
  }

  const mensagemBruta = body?.mensagem || "";
  const mensagem = mensagemBruta.toString().substring(0, 500);

  if (!mensagem.trim()) {
    return res.status(400).json({
      error: "Mensagem vazia não permitida."
    });
  }

  // 🔥 chave normalizada
  const chaveCache = normalizarTexto(mensagem);

  // ==============================
  // CACHE COM EXPIRAÇÃO
  // ==============================
  if (cache.has(chaveCache)) {
    const item = cache.get(chaveCache);

    if (Date.now() - item.timestamp < CACHE_TTL) {
      return res.status(200).json({
        resposta: item.resposta,
        cache: true
      });
    } else {
      cache.delete(chaveCache); // expirado
    }
  }

  // ==============================
  // API KEY
  // ==============================
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "API KEY não configurada"
    });
  }

  try {
    const contexto = `
Você é Elton Santos, desenvolvedor backend.

Responda de forma direta, natural e objetiva.

Pergunta: ${mensagem}
`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000); // mais agressivo

    let response;

    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: contexto }]
              }
            ],
            generationConfig: {
              maxOutputTokens: 120, // ⚡ mais rápido
              temperature: 0.7
            }
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("ERRO GEMINI:", JSON.stringify(data, null, 2));

      return res.status(500).json({
        error: "Erro na IA",
        detalhe: data?.error?.message || "Falha na API"
      });
    }

    const texto =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sem resposta da IA.";

    // ==============================
    // SALVA NO CACHE COM TIMESTAMP
    // ==============================
    cache.set(chaveCache, {
      resposta: texto,
      timestamp: Date.now()
    });

    // 🔥 limpa cache antigo (FIFO simples)
    if (cache.size > CACHE_LIMIT) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    return res.status(200).json({
      resposta: texto,
      cache: false
    });

  } catch (error) {
    console.error("ERRO GERAL:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "Tempo de resposta excedido. Tente novamente."
      });
    }

    return res.status(500).json({
      error: "Erro interno no servidor",
      detalhe: error.message
    });
  }
}