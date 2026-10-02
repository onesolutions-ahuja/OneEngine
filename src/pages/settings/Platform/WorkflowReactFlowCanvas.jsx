import { useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./WorkflowReactFlowCanvas.css";

function FlowNode({ id, data }) {
  return (
    <div className={`oe-flow-node ${data.kind === "start" ? "is-start" : ""} ${data.kind === "end" ? "is-end" : ""}`}>
      {data.kind !== "start" ? <Handle type="target" position={Position.Top} className="oe-flow-handle" /> : null}
      <div className="oe-flow-node-main" onClick={() => data.onInspect?.(data.stepId || "__start__")}>
        <span className="oe-flow-node-icon" style={{ background: data.color || "#64748b" }}>{data.icon || "•"}</span>
        <span className="oe-flow-node-copy">
          <small>{data.kindLabel || ""}</small>
          <strong>{data.label}</strong>
          {data.note ? <em>{data.note}</em> : null}
        </span>
      </div>
      {data.kind !== "end" ? (
        <>
          <Handle type="source" position={Position.Bottom} className="oe-flow-handle" />
          {data.onAdd ? <button type="button" className="oe-flow-add nodrag" aria-label={`Add element after ${data.label}`} onClick={(event) => { event.stopPropagation(); data.onAdd(); }}>+</button> : null}
        </>
      ) : null}
      {data.onDelete ? <button type="button" className="oe-flow-remove nodrag" aria-label={`Remove ${data.label}`} onClick={(event) => { event.stopPropagation(); data.onDelete(); }}>−</button> : null}
    </div>
  );
}

const nodeTypes = { flowNode: FlowNode };

function conditionPaths(step) {
  if (step?.type !== "CONDITION") return [];
  const outcomes = Array.isArray(step.config?.outcomes) && step.config.outcomes.length
    ? step.config.outcomes
    : [{ id: "outcome-1", label: "Outcome 1", branch: step.config?.ifBranch || [] }];
  return [
    ...outcomes.map((outcome, index) => ({
      key: outcome.id || `outcome-${index + 1}`,
      label: outcome.label || `Outcome ${index + 1}`,
      ids: Array.isArray(outcome.branch) ? outcome.branch : [],
    })),
    {
      key: "__default__",
      label: step.config?.defaultLabel || "Default Outcome",
      ids: Array.isArray(step.config?.defaultBranch)
        ? step.config.defaultBranch
        : Array.isArray(step.config?.elseBranch) ? step.config.elseBranch : [],
    },
  ];
}

function buildGraph({
  workflow,
  mainEntries,
  flowElementVisual,
  getActionLabel,
  getTriggerLabel,
  onInspect,
  onInsertMain,
  onInsertBranch,
  onDelete,
}) {
  const allSteps = Array.isArray(workflow?.steps) ? workflow.steps : [];
  const stepById = new Map(allSteps.map((step) => [String(step.id), step]));
  const main = mainEntries.map((entry) => entry.step || entry).filter(Boolean);
  const nodes = [];
  const edges = [];
  const MAIN_X = 420;
  const STEP_GAP = 170;
  const BRANCH_X_GAP = 300;
  const BRANCH_STEP_GAP = 145;
  let y = 20;

  const edge = (id, source, target, label = "") => ({
    id,
    source,
    target,
    label,
    type: "smoothstep",
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: "oe-flow-edge",
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 8,
  });

  nodes.push({
    id: "__start__",
    type: "flowNode",
    position: { x: MAIN_X, y },
    draggable: false,
    data: {
      kind: "start",
      label: "Start",
      kindLabel: "START",
      note: getTriggerLabel?.(workflow?.trigger) || "",
      icon: "▶",
      color: "#22a866",
      onInspect,
      onAdd: () => onInsertMain?.(0),
    },
  });

  y += 150;
  const mainPositions = new Map();
  const branchMeta = new Map();

  main.forEach((step, mainIndex) => {
    const paths = conditionPaths(step);
    const visual = flowElementVisual(step.type);
    const nodeY = y;
    mainPositions.set(String(step.id), { x: MAIN_X, y: nodeY });
    nodes.push({
      id: String(step.id),
      type: "flowNode",
      position: { x: MAIN_X, y: nodeY },
      data: {
        stepId: step.id,
        kind: step.type === "CONDITION" ? "decision" : "step",
        label: step.label || getActionLabel(step.type),
        kindLabel: getActionLabel(step.type),
        note: step.config?.description || "",
        icon: visual?.icon || "•",
        color: visual?.color || "#64748b",
        onInspect,
        onAdd: () => onInsertMain?.(mainIndex + 1),
        onDelete: () => onDelete?.(step),
      },
    });

    if (paths.length) {
      const pathStartY = nodeY + 150;
      let maxChildren = 0;
      const pathInfos = [];
      paths.forEach((path, pathIndex) => {
        const x = MAIN_X + (pathIndex - (paths.length - 1) / 2) * BRANCH_X_GAP;
        const children = path.ids.map((id) => stepById.get(String(id))).filter(Boolean);
        maxChildren = Math.max(maxChildren, children.length);
        const renderedIds = [];
        children.forEach((child, childIndex) => {
          const childVisual = flowElementVisual(child.type);
          const nodeId = `branch:${step.id}:${path.key}:${child.id}`;
          renderedIds.push(nodeId);
          nodes.push({
            id: nodeId,
            type: "flowNode",
            position: { x, y: pathStartY + childIndex * BRANCH_STEP_GAP },
            data: {
              stepId: child.id,
              kind: "branch",
              label: child.label || getActionLabel(child.type),
              kindLabel: getActionLabel(child.type),
              note: child.config?.description || "",
              icon: childVisual?.icon || "•",
              color: childVisual?.color || "#64748b",
              onInspect,
              onAdd: () => onInsertBranch?.({
                ownerId: step.id,
                kind: "decision",
                outcomeId: path.key,
                index: childIndex + 1,
              }),
              onDelete: () => onDelete?.(child),
            },
          });
        });
        pathInfos.push({ ...path, x, children, renderedIds });
      });
      branchMeta.set(String(step.id), { paths: pathInfos, pathStartY, maxChildren });
      y = pathStartY + Math.max(1, maxChildren) * BRANCH_STEP_GAP + 145;
    } else {
      y += STEP_GAP;
    }
  });

  nodes.push({
    id: "__end__",
    type: "flowNode",
    position: { x: MAIN_X, y },
    draggable: false,
    data: { kind: "end", label: "End", kindLabel: "END", icon: "■", color: "#64748b", onInspect: () => {} },
  });

  if (main.length) edges.push(edge("start-main", "__start__", String(main[0].id)));
  else edges.push(edge("start-end", "__start__", "__end__"));

  main.forEach((step, mainIndex) => {
    const source = String(step.id);
    const next = main[mainIndex + 1] ? String(main[mainIndex + 1].id) : "__end__";
    const meta = branchMeta.get(source);
    if (!meta) {
      edges.push(edge(`main:${source}:${next}`, source, next));
      return;
    }
    meta.paths.forEach((path, pathIndex) => {
      if (path.renderedIds.length) {
        edges.push(edge(`branch-enter:${source}:${path.key}`, source, path.renderedIds[0], path.label));
        path.renderedIds.forEach((nodeId, childIndex) => {
          const branchNext = path.renderedIds[childIndex + 1];
          if (branchNext) edges.push(edge(`branch-step:${nodeId}:${branchNext}`, nodeId, branchNext));
        });
        const terminal = path.renderedIds[path.renderedIds.length - 1];
        edges.push(edge(`branch-exit:${terminal}:${next}`, terminal, next));
      } else {
        edges.push(edge(`branch-empty:${source}:${path.key}:${next}`, source, next, path.label));
      }
    });
  });

  return { nodes, edges };
}

export default function WorkflowReactFlowCanvas(props) {
  const graph = useMemo(() => buildGraph(props), [
    props.workflow,
    props.mainEntries,
    props.flowElementVisual,
    props.getActionLabel,
    props.getTriggerLabel,
    props.onInspect,
    props.onInsertMain,
    props.onInsertBranch,
    props.onDelete,
  ]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  const graphKey = useMemo(
    () => JSON.stringify({
      ids: graph.nodes.map((node) => node.id),
      edges: graph.edges.map((item) => item.id),
    }),
    [graph]
  );

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graphKey, graph, setNodes, setEdges]);

  return (
    <div className="oe-reactflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => props.onReady?.(instance)}
        onMoveEnd={(_, viewport) => props.onViewportChange?.(viewport?.zoom || 1)}
        nodesConnectable={false}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.45, maxZoom: 1 }}
        minZoom={0.35}
        maxZoom={1.5}
        panOnScroll
        selectionOnDrag={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.1} color="#cbd5e1" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
