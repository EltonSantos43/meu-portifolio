import { GoogleGenerativeAI } from "@google/generative-ai";

// Inicializa IA
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Controle simples de rate limit (em memória - básico)
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
  // Permite testar no navegador
  if (req.method === "GET") {
    return res.status(200).json({ status: "API online 🚀" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  // Pega IP (Vercel)
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || "unknown";
  // Rate limit
  if (!rateLimit(ip)) {
    return res.status(429).json({
      resposta: "Muitas requisições. Tente novamente em 15 minutos."
    });
  }

  // Sanitização
  const mensagemBruta = req.body.mensagem || "";
  const mensagem = mensagemBruta.toString().substring(0, 500);

  if (!mensagem.trim()) {
    return res.status(400).json({
      error: "Mensagem vazia não permitida."
    });
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const contexto = `
Você é o Assistente Virtual do Elton Santos.

PERFIL:
- Atua na Localiza com logística de veículos blindados
- Desenvolvedor backend em formação (ADS)
- Foco em .NET, Python e APIs

PROJETOS:
- API .NET Core com Dapper e MySQL
- Sistema com Node.js e Tailwind

REGRAS:
- Seja direto
- Seja técnico
- Responda com clareza

Pergunta: ${mensagem}
`;

    const result = await model.generateContent(contexto);
    const response = await result.response;

    return res.status(200).json({
        resposta: response.text()
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro interno no servidor de IA"
    });
  }
}