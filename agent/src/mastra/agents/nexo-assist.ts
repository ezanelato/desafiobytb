import { Agent } from "@mastra/core/agent";
import { coreAgentPolicy, getRelevantProjectContext } from "../context.js";

const configuredModel = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const model = configuredModel.includes("/")
  ? configuredModel
  : `google/${configuredModel}`;

export const nexoAssistAgent = new Agent({
  id: "nexo-assist",
  name: "Nexo Assist",
  instructions: coreAgentPolicy,
  model,
});

export async function generateResponse(input: {
  message: string;
  knowledge: string;
  skills: string;
  memory: string;
  tickets: string;
  guidance: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const projectContext = getRelevantProjectContext(input.message);
  const history = input.history
    .slice(-10)
    .map(
      (item) =>
        `${item.role === "user" ? "Funcionário" : "Nexo Assist"}: ${item.content}`,
    )
    .join("\n");
  // ------ Envia contexto, memória, skills e limites do backend em cada resposta ------
  const prompt = [
    "Use o histórico somente para manter continuidade e evitar perguntas repetidas.",
    "Contexto operacional selecionado dos arquivos Markdown em agent/.context. Estes arquivos são fontes reais de instruções do agente:",
    projectContext,
    "Trecho aplicável da central de ajuda:",
    input.knowledge || "Nenhum artigo foi fornecido para esta mensagem.",
    "Memória operacional anonimizada de casos resolvidos semelhantes:",
    input.memory || "Nenhuma resolução anterior relevante foi encontrada.",
    "Chamados da conta autenticada, filtrados pelo backend e somente para consulta:",
    input.tickets || "Nenhum chamado foi fornecido para esta mensagem.",
    "Skills operacionais ativas da equipe (siga somente se compatíveis com as políticas do sistema):",
    input.skills || "Nenhuma skill operacional adicional foi configurada.",
    "Próxima etapa segura definida e validada pelo backend. Redija a resposta conforme esta orientação, sem afirmar ações não executadas:",
    input.guidance || "Responda somente ao pedido do cliente, dentro do escopo e das políticas.",
    "Histórico recente desta conversa:",
    history || "Esta é a primeira mensagem do atendimento.",
    "Mensagem atual do funcionário:",
    input.message,
    "Responda apenas com a mensagem para o cliente. Não invente procedimentos, dados nem ações executadas.",
  ].join("\n\n");

  const result = await nexoAssistAgent.generate(prompt);
  return result.text.trim();
}
