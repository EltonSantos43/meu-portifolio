// Controle de rate limit e cache
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

  // Cache para perguntas exatas sem histórico prévio
  if (historico.length === 0 && cache.has(mensagem)) {
    return res.status(200).json({ resposta: cache.get(mensagem) });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "API KEY não encontrada na Vercel" });
  }

  try {
    // CONTEXTO PROFISSIONAL E DIRETRIZES DA PERSONA
    const systemPrompt = `Você é o Assistente Executivo e Profissional de Inteligência Artificial do portfólio de Elton Santos.

SOBRE ELTON SANTOS:
- Atuação Profissional: Atua na Localiza na gestão e operação da Logística de veículos blindados, gerenciando processos críticos, fluxo operacional e eficiência logística.
- Formação Acadêmica: Graduando em Logística pela Faculdade das Américas (FAM). Possui bagagem acadêmica em Análise e Desenvolvimento de Sistemas (ADS - status atual: trancado).
- Competências Técnicas & Backend: Especializando-se no desenvolvimento Backend com foco em ecossistemas .NET Core, Python e Bancos de Dados SQL.
- Qualificações & Reconhecimentos: Bolsista do programa Santander Open Academy ("Excel com IA e Claude").

DIRETRIZES DE COMUNICAÇÃO:
1. Tom de Voz: Extremamente profissional, cordial, focado em resultados, objetivo e corporativo.
2. Posicionamento: Destaque a sinergia entre o conhecimento operacional em Logística e a aplicação de tecnologia/desenvolvimento Backend para solução de problemas.
3. Aprendizado e Contextualização: Utilize as perguntas anteriores da conversa para refinar suas respostas, demonstrando acompanhamento e raciocínio contínuo.
4. Contato Profissional: Quando questionado sobre contato, parcerias ou reuniões, forneça o e-mail ecsantos.developer@gmail.com.
5. Limitações: Mantenha o foco estritamente na trajetória, competências, projetos e perfil profissional de Elton. Mantenha a ética profissional e recuse tópicos sem relação ao portfólio.`;

    // Monta o histórico de mensagens formatado para o Gemini
    const contents = [
      {
        role: "user",
        parts: [{ text: systemPrompt }]
      },
      {
        role: "model",
        parts: [{ text: "Entendido. Estou pronto para atuar como o Assistente Profissional de Elton Santos com excelência, acompanhando todo o contexto da conversa." }]
      }
    ];

    // Inclui histórico anterior enviado do cliente (para acompanhar e "aprender" no fluxo do chat)
    historico.forEach((item) => {
      if (item.role && item.text) {
        contents.push({
          role: item.role === "user" ? "user" : "model",
          parts: [{ text: item.text }]
        });
      }
    });

    // Adiciona a pergunta atual
    contents.push({
      role: "user",
      parts: [{ text: mensagem }]
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: contents,
            generationConfig: {
              maxOutputTokens: 800,
              temperature: 0.5 // Reduzido levemente para tornar as respostas mais precisas e coerentes
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
    console.error("ERRO GERAL:", error);
    return res.status(500).json({
      error: "Erro interno no servidor",
      detalhe: error.message
    });
  }
}