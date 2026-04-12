require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // Proteção de cabeçalhos HTTP
const rateLimit = require('express-rate-limit'); // Proteção contra abusos
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.set('trust proxy', 1);

// --- CAMADA DE SEGURANÇA (BLINDAGEM) ---
app.use(helmet()); // Blindagem de headers contra exploits comuns
app.use(cors());   // Permite que seu frontend acesse o backend
app.use(express.json()); // Suporte para JSON no corpo das requisições

// Limitador: Máximo de 10 perguntas por IP a cada 15 minutos
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    message: { resposta: "Muitas requisições vindas deste IP. Tente novamente em 15 minutos." }
});

// Aplica a trava de segurança apenas na rota do chat
app.use('/', limiter);
// ----------------------------------------

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/', async (req, res) => {
    // Sanitização: Protege contra textos excessivamente longos (max 500 caracteres)
    const mensagemBruta = req.body.mensagem || "";
    const mensagem = mensagemBruta.toString().substring(0, 500);

    if (!mensagem.trim()) {
        return res.status(400).json({ error: "Mensagem vazia não permitida." });
    }

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        const contexto = `Você é o Assistente Virtual Oficial do Elton Santos. Sua missão é ser direto e respeitar o escopo da pergunta.

PERFIL DO ELTON:
- Profissional: Atua na Localiza na área de Logística. Responsável por veículos de alto padrão e blindados. Garante disponibilidade e pontualidade. Isso reflete sua disciplina e foco em processos críticos.
- Desenvolvedor: Estudante de ADS, focado em se tornar Dev Backend Sênior. Aplica maturidade de mercado para criar códigos robustos.

CONTATO OFICIAL:
- E-mail: ecsantos.developer@gmail.com
- LinkedIn: linkedin.com/in/eltonclsantos/
- WhatsApp: 5511967359604

PROJETOS TÉCNICOS:
1. Simula SaaS Pro: API em .NET Core, usando Dapper e MySQL. Foco em performance.
2. Menu Online: Sistema com Node.js, JavaScript e Tailwind CSS.

REGRAS DE RESPOSTA:
1. Sobre Localiza: Foque na logística de blindados e prontidão.
2. Sobre Desenvolvedor: Foque em ADS e Backend.
3. Sobre Projetos: Detalhe a stack técnica de cada um.
4. Mantenha tom profissional e técnico.

Pergunta do usuário: ${mensagem}`;

        const result = await model.generateContent(contexto);
        const response = await result.response;
        
        res.json({ resposta: response.text() });
    } catch (error) {
        console.error("Erro no processamento da IA:", error);
        res.status(500).json({ error: "Erro interno no servidor de IA" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Blindado rodando em http://localhost:${PORT}`));

module.exports = app;