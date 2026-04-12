// Controle simples de rate limit
const requests = new Map();

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

  // GET (teste)
  if (req.method === "GET") {
    return res.status(200).json({ status: "API online 🚀" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";

  // Rate limit
  if (!rateLimit(ip)) {
    return res.status(429).json({
      resposta: "Muitas requisições. Tente novamente em alguns minutos."
    });
  }

  // Parse seguro
  let body;
  try {
    body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;
  } catch {
    body = {};
  }

  const mensagem = (body?.mensagem || "").toString().substring(0, 500);

  if (!mensagem.trim()) {
    return res.status(400).json({
      error: "Mensagem vazia não permitida."
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "API KEY não configurada"
    });
  }

  try {
    const contexto = `
Você é Elton Santos, desenvolvedor backend.

Responda de forma direta e natural.

Pergunta: ${mensagem}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
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
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("ERRO GEMINI:", data);

      return res.status(500).json({
        error: "Erro na API Gemini",
        detalhe: data?.error?.message || data
      });
    }

    const texto =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sem resposta da IA.";

    return res.status(200).json({
      resposta: texto
    });

  } catch (error) {
    console.error("ERRO:", error);

    return res.status(500).json({
      error: "Erro interno no servidor"
    });
  }
}