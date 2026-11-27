import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { processNote } from "./services/process-note";

export interface Env {
  HYPERDRIVE: { connectionString: string };
  WEB_ORIGIN?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
}

const app = new Hono<{ Bindings: Env }>();

function getPrisma(env: Env) {
  const adapter = new PrismaPg({ connectionString: env.HYPERDRIVE.connectionString });
  return new PrismaClient({ adapter });
}

app.use("/api/*", async (c, next) => {
  const allowedOrigins = (
    c.env.WEB_ORIGIN || "http://localhost:5173,http://localhost:5174"
  )
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""));

  return cors({ origin: allowedOrigins })(c, next);
});

app.get("/api/health", async (c) => {
  const prisma = getPrisma(c.env);
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: "ok", database: "connected" });
  } catch {
    return c.json({ status: "degraded", database: "unavailable" }, 503);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

const inputSchema = z.object({ content: z.string().trim().min(10).max(20000) });

app.post("/api/notes/process", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Informe uma anotação com pelo menos 10 caracteres.", details: parsed.error.flatten() }, 400);
  }

  const prisma = getPrisma(c.env);
  try {
    const note = await prisma.note.create({ data: { content: parsed.data.content } });
    const execution = await prisma.execution.create({ data: { noteId: note.id } });

    // Mantém o Worker vivo até o processNote e a desconexão do Prisma terminarem
    c.executionCtx.waitUntil(
      processNote(prisma, note.id, execution.id, parsed.data.content, {
        baseUrl: c.env.AI_BASE_URL,
        apiKey: c.env.AI_API_KEY,
        model: c.env.AI_MODEL,
      }).finally(() => prisma.$disconnect())
    );

    return c.json({ noteId: note.id, executionId: execution.id }, 202);
  } catch (error) {
    console.error(error);
    c.executionCtx.waitUntil(prisma.$disconnect());
    return c.json({ error: "Não foi possível iniciar o processamento." }, 500);
  }
});

app.get("/api/executions/:id", async (c) => {
  const prisma = getPrisma(c.env);
  try {
    const execution = await prisma.execution.findUnique({
      where: { id: c.req.param("id") },
      include: { events: { orderBy: { sequence: "asc" } }, note: { include: { tasks: true } } },
    });
    if (!execution) return c.json({ error: "Execução não encontrada." }, 404);
    return c.json(execution);
  } finally {
    c.executionCtx.waitUntil(prisma.$disconnect());
  }
});

app.get("/api/executions/:id/events", async (c) => {
  const executionId = c.req.param("id");
  const prisma = getPrisma(c.env);

  const exists = await prisma.execution.findUnique({ where: { id: executionId }, select: { id: true } });
  if (!exists) {
    c.executionCtx.waitUntil(prisma.$disconnect());
    return c.body(null, 404);
  }

  return streamSSE(c, async (stream) => {
    let lastSequence = Number(c.req.header("last-event-id") || 0);
    try {
      while (!stream.aborted) {
        const events = await prisma.executionEvent.findMany({
          where: { executionId, sequence: { gt: lastSequence } },
          orderBy: { sequence: "asc" },
        });
        for (const event of events) {
          await stream.writeSSE({ id: String(event.sequence), data: JSON.stringify(event) });
          lastSequence = event.sequence;
        }
        const current = await prisma.execution.findUnique({ where: { id: executionId }, select: { status: true } });
        if (current && current.status !== "RUNNING") {
          await stream.writeSSE({ event: "complete", data: JSON.stringify({ status: current.status }) });
          break;
        }
        await stream.sleep(400);
      }
    } finally {
      await prisma.$disconnect();
    }
  });
});

export default app;