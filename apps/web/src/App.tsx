import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Copy,
  FileText,
  LoaderCircle,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { ObservabilityGraph } from "./ObservabilityGraph";

const API = "http://localhost:4000/api";
type EventItem = {
  id: string;
  sequence: number;
  stage: string;
  message: string;
  status: string;
  durationMs?: number | null;
  createdAt: string;
  metadata?: any;
};
type Task = {
  id: string;
  title: string;
  assignee?: string | null;
  dueText?: string | null;
  status: string;
};

const sample =
  "Clóvis precisa revisar os orçamentos. Temos que verificar a integração com Omie. Lidiane ficou de levantar os custos de instalação. Precisamos conversar novamente na sexta.";

export default function App() {
  const [content, setContent] = useState(sample);
  const [executionId, setExecutionId] = useState("");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState("IDLE");
  const [error, setError] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(-1);
  const [speed, setSpeed] = useState(1);

  // Estados de interação das tarefas
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: "", assignee: "", dueText: "" });

  useEffect(() => {
    if (!executionId || status !== "RUNNING") return;
    const source = new EventSource(`${API}/executions/${executionId}/events`);
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as EventItem;
      setEvents((current) =>
        current.some((x) => x.sequence === event.sequence)
          ? current
          : [...current, event].sort((a, b) => a.sequence - b.sequence)
      );
    };
    source.addEventListener("complete", async () => {
      const result = await fetch(`${API}/executions/${executionId}`).then((r) => r.json());
      setTasks(result.note.tasks || []);
      setStatus(result.status);
      source.close();
    });
    source.onerror = () => {
      /* EventSource retries automatically while server is available. */
    };
    return () => source.close();
  }, [executionId, status]);

  const run = async () => {
    setError("");
    setEvents([]);
    setTasks([]);
    setEditingId(null);
    setReplayIndex(-1);
    setReplaying(false);
    setStatus("RUNNING");
    try {
      const response = await fetch(`${API}/notes/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha ao iniciar.");
      setExecutionId(result.executionId);
    } catch (e) {
      setStatus("FAILED");
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    }
  };

  const replay = () => {
    if (!events.length) return;
    setReplaying(true);
    setReplayIndex(0);
  };

  useEffect(() => {
    if (!replaying || replayIndex < 0) return;
    if (replayIndex >= events.length) {
      setReplaying(false);
      return;
    }
    const timer = window.setTimeout(() => setReplayIndex((i) => i + 1), 1100 / speed);
    return () => window.clearTimeout(timer);
  }, [replaying, replayIndex, events.length, speed]);

  // Ações nas tarefas
  const toggleTaskDone = (id: string) => {
    setTasks((current) =>
      current.map((t) =>
        t.id === id ? { ...t, status: t.status === "DONE" ? "OPEN" : "DONE" } : t
      )
    );
  };

  const startEdit = (task: Task) => {
    setEditingId(task.id);
    setEditDraft({
      title: task.title,
      assignee: task.assignee || "",
      dueText: task.dueText || "",
    });
  };

  const saveEdit = (id: string) => {
    if (!editDraft.title.trim()) return;
    setTasks((current) =>
      current.map((t) =>
        t.id === id
          ? {
              ...t,
              title: editDraft.title.trim(),
              assignee: editDraft.assignee.trim() || null,
              dueText: editDraft.dueText.trim() || null,
            }
          : t
      )
    );
    setEditingId(null);
  };

  const copyMarkdown = async () => {
    if (!tasks.length) return;
    const md = tasks
      .map((t) => {
        const check = t.status === "DONE" ? "x" : " ";
        const meta = [t.assignee && `@${t.assignee}`, t.dueText].filter(Boolean).join(" · ");
        return `- [${check}] ${t.title}${meta ? ` _(${meta})_` : ""}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(md);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const visibleEvents =
    replaying || replayIndex >= 0 ? events.slice(0, Math.max(0, replayIndex + 1)) : events;
  const stageNames: Record<string, string> = {
    page: "Página",
    server: "Servidor",
    database: "Banco de dados",
    external: "Serviço externo",
  };
  const progress = events.length
    ? Math.round((visibleEvents.length / Math.max(events.length, 1)) * 100)
    : 0;
  const doneCount = tasks.filter((t) => t.status === "DONE").length;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brandmark">
            <Workflow size={21} />
          </div>
          <div>
            <strong>FlowMind</strong>
            <span>Transforme informação em ação</span>
          </div>
        </div>
        <div className="topmeta">
          <span className="live-dot" /> LOCAL WORKSPACE <span className="version">v0.1.0</span>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">
            <Sparkles size={14} /> PRODUTIVIDADE INTELIGENTE
          </div>
          <h1>
            Menos ruído.
            <br />
            <em>Mais ação.</em>
          </h1>
          <p>
            Transforme anotações dispersas em tarefas claras, com responsáveis, prazos e uma
            trilha de execução verificável.
          </p>
        </div>
        <div className="hero-card">
          <Activity size={22} />
          <div>
            <b>Execução rastreável</b>
            <span>Da entrada ao resultado, cada etapa registrada.</span>
          </div>
        </div>
      </section>

      <section className="workspace">
        <div className="panel input-panel">
          <div className="panel-head">
            <div>
              <span className="step">01 / ENTRADA</span>
              <h2>Sua anotação</h2>
            </div>
            <FileText size={19} />
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Cole suas anotações, decisões ou conversas..."
          />
          <div className="input-footer">
            <span>{content.length.toLocaleString("pt-BR")} caracteres</span>
            <button
              className="primary"
              onClick={run}
              disabled={status === "RUNNING" || content.trim().length < 10}
            >
              {status === "RUNNING" ? (
                <>
                  <LoaderCircle className="spin" size={16} /> Processando
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Transformar em tarefas
                </>
              )}
            </button>
          </div>
          {error && (
            <div className="error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>

        <div className="panel result-panel">
          <div className="panel-head">
            <div>
              <span className="step">02 / RESULTADO</span>
              <h2>Tarefas identificadas</h2>
            </div>
            <div className="result-actions">
              {tasks.length > 0 && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={copyMarkdown}
                  title="Copiar lista em Markdown"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? "Copiado!" : "Markdown"}</span>
                </button>
              )}
              <span className="count">
                {tasks.length > 0 && doneCount > 0 ? `${doneCount}/${tasks.length}` : tasks.length}
              </span>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <Circle size={23} />
              </div>
              <b>Seu próximo passo começa aqui</b>
              <span>Execute o processamento para visualizar as tarefas estruturadas.</span>
            </div>
          ) : (
            <div className="task-list">
              {tasks.map((task, i) => {
                const isDone = task.status === "DONE";
                const isEditing = editingId === task.id;

                if (isEditing) {
                  return (
                    <div className="task task-editing" key={task.id}>
                      <div className="task-edit-fields">
                        <input
                          type="text"
                          value={editDraft.title}
                          onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                          placeholder="Título da tarefa"
                          autoFocus
                        />
                        <div className="task-edit-meta">
                          <input
                            type="text"
                            value={editDraft.assignee}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, assignee: e.target.value })
                            }
                            placeholder="Responsável"
                          />
                          <input
                            type="text"
                            value={editDraft.dueText}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, dueText: e.target.value })
                            }
                            placeholder="Prazo (ex: sexta)"
                          />
                        </div>
                      </div>
                      <div className="task-edit-btns">
                        <button
                          type="button"
                          className="task-action-btn save"
                          onClick={() => saveEdit(task.id)}
                          title="Salvar"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          type="button"
                          className="task-action-btn"
                          onClick={() => setEditingId(null)}
                          title="Cancelar"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className={`task ${isDone ? "done" : ""}`} key={task.id}>
                    <button
                      type="button"
                      className="task-check"
                      onClick={() => toggleTaskDone(task.id)}
                      title={isDone ? "Reabrir tarefa" : "Concluir tarefa"}
                    >
                      {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                    <div onClick={() => toggleTaskDone(task.id)} style={{ cursor: "pointer" }}>
                      <b>{task.title}</b>
                      <span>
                        {[task.assignee, task.dueText].filter(Boolean).join(" · ") ||
                          "Responsável e prazo a definir"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="task-edit-trigger"
                      onClick={() => startEdit(task)}
                      title="Editar tarefa"
                    >
                      <Pencil size={13} />
                    </button>
                    <small>{String(i + 1).padStart(2, "0")}</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="panel trace-panel">
        <div className="panel-head trace-head">
          <div>
            <span className="step">03 / OBSERVABILIDADE</span>
            <h2>Como funciona</h2>
            <p>Eventos persistidos durante uma execução real.</p>
          </div>
          <div className="trace-actions">
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.5}>0,5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
            <button
              className="secondary"
              onClick={replay}
              disabled={!events.length || status === "RUNNING"}
            >
              <RotateCcw size={15} /> Replay
            </button>
          </div>
        </div>

        <ObservabilityGraph
          events={visibleEvents}
          isRunning={status === "RUNNING" || replaying}
        />

        <div className="trace-toolbar">
          <div>
            <span className={`status-dot ${status.toLowerCase()}`} />
            <b>
              {status === "IDLE"
                ? "Aguardando execução"
                : status === "RUNNING"
                ? "Execução em andamento"
                : status === "SUCCEEDED"
                ? "Execução concluída"
                : "Execução com falha"}
            </b>
          </div>
          <span>
            {visibleEvents.length} / {events.length} eventos
          </span>
        </div>

        <div className="progress">
          <div style={{ width: `${progress}%` }} />
        </div>

        {visibleEvents.length === 0 ? (
          <div className="trace-empty">
            <Clock3 size={19} />
            <span>O diagrama será atualizado conforme os eventos chegarem do servidor.</span>
          </div>
        ) : (
          <div className="event-list">
            {visibleEvents.map((event) => (
              <div className="event-row" key={event.id}>
                <div className={`event-mark ${event.status.toLowerCase()}`}>
                  {event.status === "SUCCESS" ? (
                    <CheckCircle2 size={15} />
                  ) : event.status === "ERROR" ? (
                    <AlertCircle size={15} />
                  ) : (
                    <Clock3 size={15} />
                  )}
                </div>
                <div className="event-copy">
                  <b>{stageNames[event.stage] || event.stage}</b>
                  <span>{event.message}</span>
                </div>
                <time>{event.durationMs ?? "—"} ms</time>
                <small>{event.status}</small>
              </div>
            ))}
          </div>
        )}

        {replayIndex >= 0 && (
          <div className="replay-note">
            <Play size={13} /> {replaying ? "Reproduzindo execução" : "Replay finalizado"} · {speed}×
          </div>
        )}
      </section>

      <footer>
        <span>FLOWMIND © 2026</span>
        <span>Construído para transformar contexto em execução.</span>
      </footer>
    </main>
  );
}