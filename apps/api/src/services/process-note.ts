import { PrismaClient } from "@prisma/client";

type ExtractedTask = { title: string; description?: string; assignee?: string; dueText?: string };

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok || (response.status !== 503 && response.status !== 429)) {
      return response;
    }

    if (attempt < retries) {
      const waitMs = 1000 * Math.pow(2, attempt); // 1s, 2s
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw new Error("AI_PROVIDER_UNAVAILABLE");
}

function extractLocalFallback(content: string): { tasks: ExtractedTask[]; provider: string } {
  const chunks = content.split(/[\n.!?;]+/).map((x) => x.trim()).filter((x) => x.length > 8);
  const tasks = chunks.slice(0, 12).map((chunk) => {
    const who = chunk.match(/\b(Clóvis|Lidiane|Marcelo)\b/i)?.[0];
    const due = chunk.match(/\b(hoje|amanhã|sexta(?:-feira)?|segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?)\b/i)?.[0];
    return { title: chunk.charAt(0).toUpperCase() + chunk.slice(1), assignee: who, dueText: due };
  });
  return { tasks, provider: "Fallback local (sem IA externa)" };
}

async function extractTasks(content: string): Promise<{ tasks: ExtractedTask[]; provider: string }> {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (baseUrl && apiKey && model) {
    const response = await fetchWithRetry(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Extraia tarefas de anotações em português. Retorne JSON: {"tasks":[{"title":"...","description":"...","assignee":"...","dueText":"..."}]}. Não invente responsáveis ou datas; use null quando ausentes.'
          },
          { role: "user", content }
        ]
      })
    });
    if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
    const payload = (await response.json()) as any;
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
    if (!Array.isArray(parsed.tasks)) throw new Error("AI_INVALID_RESPONSE");
    return { tasks: parsed.tasks, provider: "AI externa" };
  }

  return extractLocalFallback(content);
}

export async function processNote(prisma: PrismaClient, noteId: string, executionId: string, content: string) {
  let sequence = 0;
  const emit = async (stage: string, message: string, status: string, durationMs?: number, metadata?: object) => {
    await prisma.executionEvent.create({
      data: { executionId, sequence: ++sequence, stage, message, status, durationMs, metadata: metadata as any }
    });
  };

  try {
    let start = Date.now();
    await emit("page", "Anotação recebida pelo servidor.", "SUCCESS", Date.now() - start);

    start = Date.now();
    if (content.trim().length < 10) throw new Error("INVALID_NOTE");
    await emit("server", "Conteúdo validado.", "SUCCESS", Date.now() - start);

    start = Date.now();
    let extracted: Awaited<ReturnType<typeof extractTasks>>;
    try {
      extracted = await extractTasks(content);
      await emit("external", `Extração concluída usando ${extracted.provider}.`, "SUCCESS", Date.now() - start, {
        provider: extracted.provider
      });
    } catch (error) {
      await emit(
        "external",
        "IA externa indisponível; aplicando extração local de contingência.",
        "WARNING",
        Date.now() - start,
        { reason: String(error) }
      );
      extracted = extractLocalFallback(content);
    }

    start = Date.now();
    const tasks = extracted.tasks.filter((t) => typeof t.title === "string" && t.title.trim()).slice(0, 30);
    await prisma.task.createMany({
      data: tasks.map((t) => ({
        title: t.title.trim().slice(0, 240),
        description: t.description || null,
        assignee: t.assignee || null,
        dueText: t.dueText || null,
        noteId
      }))
    });
    await emit("database", `${tasks.length} tarefa(s) persistida(s).`, "SUCCESS", Date.now() - start, {
      taskCount: tasks.length
    });

    await emit("page", "Resultado pronto para apresentação.", "SUCCESS", 0);
    await prisma.execution.update({ where: { id: executionId }, data: { status: "SUCCEEDED", endedAt: new Date() } });
  } catch (error) {
    await emit("server", "A execução foi encerrada com erro; a anotação original continua salva.", "ERROR", 0, {
      reason: String(error)
    });
    await prisma.execution.update({ where: { id: executionId }, data: { status: "FAILED", endedAt: new Date() } });
  }
}