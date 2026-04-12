// Controle simples de rate limit (em memória - básico)
const requests = new Map();
const cache = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const windowTime = 15 * 60 * 1000; // 15 min
  const limit = 10;

  if (!requests.has(ip)) {
    requests.set(ip, []);
  }

  const timestamps = requests.get(ip).filter(t => now - t < windowTime);
  timestamps.push(now);
  requests.set(ip, timestamps);

  return timestamps.length <= limit;
}

export default async function handler(req, res) {
  // Teste GET
  if (req.method === "GET") {
    return res.status(200).json({ status: "API online 🚀" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // IP (Vercel)
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";

  // Rate limit
  if (!rateLimit(ip)) {
    return res.status(429).json({
      resposta: "Muitas requisições. Tente novamente em 15 minutos."
    });
  }

  // Parse seguro do body
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    body = {};
  }

  const mensagemBruta = body?.mensagem || "";
  const mensagem = mensagemBruta.toString().substring(0, 500);

  // ❗ valida antes de tudo
  if (!mensagem.trim()) {
    return res.status(400).json({ error: "Mensagem vazia não permitida." });
  }

  // ✅ cache depois da validação
  if (cache.has(mensagem)) {
    return res.status(200).json({ resposta: cache.get(mensagem) });
  }

  // Verifica API KEY
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "API KEY não encontrada na Vercel" });
  }

  try {
    // Dentro do seu handler no api/chat.js, substitua a variável contexto por esta:
    const contexto = `Você é o Assistente Virtual Oficial do Elton Santos. 

      PERFIL DO ELTON:
      - Profissional: Atua na Localiza na área de Logística de veículos blindados. Focado em processos críticos.
      - Desenvolvedor: Estudante de ADS, focado em Backend (.NET Core, Python, SQL).

      REGRAS:
      - Seja direto, técnico e profissional.
      - Se perguntarem sobre contato, cite o e-mail: ecsantos.developer@gmail.com.

      Pergunta do usuário: ${mensagem}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

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
              maxOutputTokens: 800, // ✅ Aumentamos para permitir respostas completas
              temperature: 0.7     // Opcional: deixa a resposta mais natural
            }
          })
        }
      );
    } finally {
      clearTimeout(timeout); // ✅ sempre limpa
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("ERRO GEMINI:", JSON.stringify(data, null, 2));
      return res.status(500).json({
        error: "Erro na API Gemini",
        detalhe: data?.error?.message || data
      });
    }

    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sem resposta da IA.";

    // ✅ salva no cache
    cache.set(mensagem, texto);

    // ✅ limita tamanho do cache
    if (cache.size > 50) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    return res.status(200).json({ resposta: texto });

  } catch (error) {
    console.error("ERRO GERAL:", error);
    return res.status(500).json({
      error: "Erro interno no servidor",
      detalhe: error.message
    });
  }
}