import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { processNote } from "./services/process-note";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.API_PORT || 4000);

app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", database: "unavailable" });
  }
});

const inputSchema = z.object({ content: z.string().trim().min(10).max(20000) });

app.post("/api/notes/process", async (req, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe uma anotação com pelo menos 10 caracteres.", details: parsed.error.flatten() });

  try {
    const note = await prisma.note.create({ data: { content: parsed.data.content } });
    const execution = await prisma.execution.create({ data: { noteId: note.id } });
    // Respond immediately; the browser receives progress through the SSE endpoint.
    res.status(202).json({ noteId: note.id, executionId: execution.id });
    void processNote(prisma, note.id, execution.id, parsed.data.content);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Não foi possível iniciar o processamento." });
  }
});

app.get("/api/executions/:id", async (req, res) => {
  const execution = await prisma.execution.findUnique({
    where: { id: req.params.id },
    include: { events: { orderBy: { sequence: "asc" } }, note: { include: { tasks: true } } }
  });
  if (!execution) return res.status(404).json({ error: "Execução não encontrada." });
  res.json(execution);
});

app.get("/api/executions/:id/events", async (req, res) => {
  const executionId = req.params.id;
  const exists = await prisma.execution.findUnique({ where: { id: executionId }, select: { id: true } });
  if (!exists) return res.status(404).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let lastSequence = Number(req.headers["last-event-id"] || 0);
  let closed = false;
  req.on("close", () => { closed = true; });

  const sendPending = async () => {
    if (closed) return;
    const events = await prisma.executionEvent.findMany({
      where: { executionId, sequence: { gt: lastSequence } },
      orderBy: { sequence: "asc" }
    });
    for (const event of events) {
      res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);
      lastSequence = event.sequence;
    }
    const current = await prisma.execution.findUnique({ where: { id: executionId }, select: { status: true } });
    if (current && current.status !== "RUNNING") {
      res.write(`event: complete\ndata: ${JSON.stringify({ status: current.status })}\n\n`);
      res.end();
      closed = true;
    }
  };

  await sendPending();
  const timer = setInterval(() => { void sendPending(); }, 400);
  res.on("close", () => clearInterval(timer));
});

app.listen(port, () => console.log(`FlowMind API running at http://localhost:${port}`));

process.on("SIGINT", async () => { await prisma.$disconnect(); process.exit(0); });
