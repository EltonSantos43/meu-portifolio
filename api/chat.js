// Controle de rate limit e cache
const requests = new Map();
const cache = new Map();

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

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "API online 🚀" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";

  if (!rateLimit(ip)) {
    return res.status(429).json({
      resposta: "Muitas requisições. Tente novamente em 15 minutos."
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    body = {};
  }

  const mensagemBruta = body?.mensagem || "";
  const mensagem = mensagemBruta.toString().substring(0, 500);
  const historico = Array.isArray(body?.historico) ? body.historico : [];

  if (!mensagem.trim()) {
    return res.status(400).json({ error: "Mensagem vazia não permitida." });
  }

  if (historico.length === 0 && cache.has(mensagem)) {
    return res.status(200).json({ resposta: cache.get(mensagem) });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API KEY não encontrada na Vercel" });
  }

  try {
    const systemPrompt = `Você é o Assistente Executivo e Profissional do portfólio de Elton Santos.

SOBRE ELTON SANTOS:
- Atuação Profissional: Atua na Localiza na gestão e operação da Logística de veículos blindados.
- Formação Acadêmica: Graduando em Logística pela Faculdade das Américas (FAM). Cursou Análise e Desenvolvimento de Sistemas (ADS - status atual: trancado).
- Competências Técnicas: Focado em desenvolvimento Backend (.NET Core, Python, SQL).
- Cursos/Conquistas: Bolsista do programa Santander Open Academy ("Excel com IA e Claude").

DIRETRIZES:
- Seja extremamente profissional, objetivo e direto.
- Destaque a aplicação de tecnologia Backend na otimização de processos de Logística.
- Para contato, informe o e-mail: ecsantos.developer@gmail.com.`;

    const contents = [
      {
        role: "user",
        parts: [{ text: systemPrompt }]
      },
      {
        role: "model",
        parts: [{ text: "Entendido. Estou pronto para responder em nome de Elton Santos com profissionalismo." }]
      }
    ];

    historico.forEach((item) => {
      if (item.role && item.text) {
        contents.push({
          role: item.role === "user" ? "user" : "model",
          parts: [{ text: item.text }]
        });
      }
    });

    contents.push({
      role: "user",
      parts: [{ text: mensagem }]
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: contents,
            generationConfig: {
              maxOutputTokens: 800,
              temperature: 0.5
            }
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("ERRO GEMINI:", data);
      return res.status(500).json({
        error: "Erro na API Gemini",
        detalhe: data?.error?.message || data
      });
    }

    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sem resposta da IA.";

    if (historico.length === 0) {
      cache.set(mensagem, texto);
      if (cache.size > 50) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
      }
    }

    return res.status(200).json({ resposta: texto });

  } catch (error) {
    console.error("ERRO GERAL:", error?.message || error);
    return res.status(500).json({
      error: "Erro interno no servidor",
      detalhe: error?.message || "Erro desconhecido"
    });
  }
}