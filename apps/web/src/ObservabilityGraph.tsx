import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
// @ts-ignore The bundler loads this stylesheet, but TypeScript has no CSS module declaration.
import "@xyflow/react/dist/style.css";
import { Activity, Database, Server, Sparkles } from "lucide-react";

export type TraceEvent = {
  id: string;
  sequence: number;
  stage: string;
  message: string;
  status: string;
  durationMs?: number | null;
};

type StageNodeData = {
  stageKey: string;
  label: string;
  count: number;
  totalMs: number;
  visited: boolean;
  active: boolean;
  hasError: boolean;
};

const stageIcons: Record<string, React.ReactNode> = {
  page: <Activity size={18} />,
  server: <Server size={18} />,
  database: <Database size={18} />,
  external: <Sparkles size={18} />,
};

function StageNode({ data }: NodeProps<Node<StageNodeData>>) {
  const stateClass = data.hasError
    ? "error"
    : data.active
    ? "active"
    : data.visited
    ? "visited"
    : "";

  return (
    <div className={`rf-stage-node ${stateClass}`}>
      {data.stageKey !== "page" && (
        <Handle type="target" position={Position.Left} className="rf-handle" />
      )}
      <div className="rf-node-header">
        <div className="rf-node-icon">{stageIcons[data.stageKey]}</div>
        {data.totalMs > 0 && <span className="rf-node-ms">{data.totalMs} ms</span>}
      </div>
      <strong className="rf-node-title">{data.label}</strong>
      <span className="rf-node-sub">
        {data.count} {data.count === 1 ? "evento" : "eventos"}
      </span>
      {data.stageKey !== "external" && (
        <Handle type="source" position={Position.Right} className="rf-handle" />
      )}
    </div>
  );
}

const nodeTypes = { stageNode: StageNode };

const STAGES = [
  { key: "page", label: "Página", x: 0, y: 20 },
  { key: "server", label: "Servidor", x: 245, y: 20 },
  { key: "database", label: "Banco de dados", x: 490, y: 20 },
  { key: "external", label: "Serviço externo", x: 735, y: 20 },
];

export function ObservabilityGraph({
  events,
  isRunning,
}: {
  events: TraceEvent[];
  isRunning: boolean;
}) {
  const lastStage = events.length > 0 ? events[events.length - 1].stage : null;

  const nodes: Node<StageNodeData>[] = useMemo(() => {
    return STAGES.map((stage) => {
      const stageEvents = events.filter((e) => e.stage === stage.key);
      const totalMs = stageEvents.reduce((acc, e) => acc + (e.durationMs ?? 0), 0);
      const hasError = stageEvents.some((e) => e.status === "ERROR");

      return {
        id: stage.key,
        type: "stageNode",
        position: { x: stage.x, y: stage.y },
        draggable: true,
        data: {
          stageKey: stage.key,
          label: stage.label,
          count: stageEvents.length,
          totalMs,
          visited: stageEvents.length > 0,
          active: isRunning && lastStage === stage.key,
          hasError,
        },
      };
    });
  }, [events, isRunning, lastStage]);

  const edges: Edge[] = useMemo(() => {
    const connections = [
      { id: "e-page-server", source: "page", target: "server" },
      { id: "e-server-database", source: "server", target: "database" },
      { id: "e-database-external", source: "database", target: "external" },
    ];

    return connections.map((conn) => {
      const sourceVisited = events.some((e) => e.stage === conn.source);
      const targetVisited = events.some((e) => e.stage === conn.target);
      const activeEdge = sourceVisited && targetVisited;

      return {
        ...conn,
        animated: activeEdge,
        style: {
          stroke: activeEdge ? "#56cde0" : "rgba(103, 207, 224, 0.2)",
          strokeWidth: activeEdge ? 2.2 : 1.5,
        },
      };
    });
  }, [events]);

  return (
    <div className="rf-container">
      <ReactFlow
        style={{ width: "100%", height: "100%" }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        panOnScroll={false}
        zoomOnScroll={false}
        nodesConnectable={false}
      >
        <Background color="rgba(103, 207, 224, 0.08)" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}