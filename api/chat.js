// Controle simples de rate limit em memória
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
  // GET para teste de vida da API
  if (req.method === "GET") {
    return res.status(200).json({ status: "API online 🚀" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // Identificação de IP para Rate Limit na Vercel
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";

  if (!rateLimit(ip)) {
    return res.status(429).json({
      resposta: "Muitas requisições. Tente novamente em 15 minutos."
    });
  }

  // Sanitização da mensagem
  const mensagem = (req.body?.mensagem || "").toString().substring(0, 500);

  if (!mensagem.trim()) {
    return res.status(400).json({ error: "Mensagem vazia não permitida." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Configuração de API pendente no servidor." });
  }

  try {
    const contexto = `Você é o Assistente Virtual do Elton Santos. 
Perfil: Atua na Localiza com logística de blindados e é desenvolvedor backend (ADS).
Missão: Responder de forma direta, técnica e profissional.

Pergunta do usuário: ${mensagem}`;

    // Requisição direta para a API do Google (mais leve para Serverless)
    const googleResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: contexto }] }]
        })
      }
    );

    const data = await googleResponse.json();

    if (!googleResponse.ok) {
      throw new Error(data.error?.message || "Erro na API do Google");
    }

    const textoIA = data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui processar sua pergunta.";

    return res.status(200).json({ resposta: textoIA });

  } catch (error) {
    console.error("Erro no processamento:", error);
    return res.status(500).json({ error: "Erro ao processar sua pergunta. Tente novamente." });
  }
}