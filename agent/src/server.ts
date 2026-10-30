import { createServer } from "node:http";
import { generateResponse } from "./mastra/agents/nexo-assist.js";

const port = Number(process.env.AGENT_PORT ?? 4112);

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok", provider: "mastra" }));
    return;
  }

  if (request.method !== "POST" || request.url !== "/respond") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Rota não encontrada." }));
    return;
  }

  if (!process.env.GOOGLE_API_KEY) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "GEMINI_API_KEY não configurada." }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 48_000) {
        response.writeHead(413, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Contexto muito grande." }));
        return;
      }
      chunks.push(Buffer.from(chunk));
    }

    const input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      message?: string;
      knowledge?: string;
      skills?: string;
      memory?: string;
      tickets?: string;
      guidance?: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    };
    if (!input.message?.trim()) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Mensagem obrigatória." }));
      return;
    }

    const text = await generateResponse({
      message: input.message,
      knowledge: input.knowledge ?? "",
      skills: input.skills ?? "",
      memory: input.memory ?? "",
      tickets: input.tickets ?? "",
      guidance: input.guidance ?? "",
      history: input.history ?? [],
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ text }));
  } catch {
    response.writeHead(502, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ error: "O agente Mastra não concluiu a resposta." }),
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Nexo Assist Mastra ouvindo em 127.0.0.1:${port}\n`);
});
