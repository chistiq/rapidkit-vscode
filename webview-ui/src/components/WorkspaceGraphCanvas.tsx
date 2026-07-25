import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkspaceGraphEntityProjection,
  WorkspaceGraphRelationProjection,
} from '@workspai-contracts/workspaceGraphProjection';
import {
  layoutWorkspaceGraph,
  type GraphLayoutPoint,
  type GraphLayoutRequest,
  type GraphLayoutResult,
} from '@/lib/workspaceGraphLayout';
import {
  createWorkspaceGraphWorker,
  type WorkspaceGraphWorkerHandle,
} from '@/lib/workspaceGraphWorker';

declare global {
  interface Window {
    WORKSPAI_GRAPH_WORKER_URI?: string;
  }
}

type Viewport = { x: number; y: number; scale: number };
const NODE_RADIUS = 7;

export function WorkspaceGraphCanvas({
  entities,
  relations,
  selectedId,
  onSelect,
  highlightedIds,
  presentation,
}: {
  entities: WorkspaceGraphEntityProjection[];
  relations: WorkspaceGraphRelationProjection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  highlightedIds: string[];
  presentation: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointsRef = useRef<Map<string, GraphLayoutPoint>>(new Map());
  const dragRef = useRef<{ x: number; y: number; origin: Viewport; moved: boolean } | null>(null);
  const requestRef = useRef(0);
  const layoutSizeRef = useRef({ width: 1200, height: 800 });
  const pulseStartedRef = useRef(0);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [animationTime, setAnimationTime] = useState(0);
  const highlightedSet = useMemo(() => new Set(highlightedIds), [highlightedIds]);
  const degreeById = useMemo(() => {
    const degrees = new Map<string, number>();
    for (const relation of relations) {
      degrees.set(relation.from, (degrees.get(relation.from) ?? 0) + 1);
      degrees.set(relation.to, (degrees.get(relation.to) ?? 0) + 1);
    }
    return degrees;
  }, [relations]);

  const fitToLayout = useCallback(
    (layout = layoutSizeRef.current) => {
      const scale = Math.min(size.width / layout.width, size.height / layout.height) * 0.92;
      setViewport({
        scale,
        x: (size.width - layout.width * scale) / 2,
        y: (size.height - layout.height * scale) / 2,
      });
    },
    [size.height, size.width]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      const height = Math.max(360, Math.floor(entry.contentRect.height));
      setSize({ width, height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let workerHandle: WorkspaceGraphWorkerHandle | null = null;
    const request: GraphLayoutRequest = {
      requestId: ++requestRef.current,
      nodes: entities.map(({ id, kind, projectId }) => ({ id, kind, projectId })),
      edges: relations.map(({ from, to }) => ({ from, to })),
    };
    const accept = (result: GraphLayoutResult) => {
      if (result.requestId !== requestRef.current) return;
      pointsRef.current = new Map(result.points.map((point) => [point.id, point]));
      layoutSizeRef.current = { width: result.width, height: result.height };
      fitToLayout(layoutSizeRef.current);
      setLayoutRevision((value) => value + 1);
    };
    const workerUri = window.WORKSPAI_GRAPH_WORKER_URI;
    if (!workerUri || typeof Worker === 'undefined') {
      accept(layoutWorkspaceGraph(request));
      return;
    }
    void createWorkspaceGraphWorker(workerUri)
      .then((handle) => {
        if (disposed) {
          handle.dispose();
          return;
        }
        workerHandle = handle;
        handle.worker.onmessage = (event: MessageEvent<GraphLayoutResult>) => accept(event.data);
        handle.worker.onerror = () => {
          if (!disposed) {
            accept(layoutWorkspaceGraph(request));
          }
        };
        handle.worker.postMessage(request);
      })
      .catch(() => {
        if (!disposed) {
          accept(layoutWorkspaceGraph(request));
        }
      });
    return () => {
      disposed = true;
      workerHandle?.dispose();
    };
  }, [entities, fitToLayout, relations]);

  useEffect(() => {
    if (!highlightedIds.length) return;
    pulseStartedRef.current = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const elapsed = now - pulseStartedRef.current;
      setAnimationTime(elapsed);
      if (elapsed < 2600) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [highlightedIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * ratio);
    canvas.height = Math.floor(size.height * ratio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const background = context.createRadialGradient(
      size.width * 0.5,
      size.height * 0.44,
      10,
      size.width * 0.5,
      size.height * 0.5,
      Math.max(size.width, size.height) * 0.72
    );
    background.addColorStop(0, 'rgba(34, 211, 238, 0.075)');
    background.addColorStop(0.45, 'rgba(99, 102, 241, 0.035)');
    background.addColorStop(1, 'rgba(2, 6, 23, 0)');
    context.fillStyle = background;
    context.fillRect(0, 0, size.width, size.height);
    context.save();
    context.translate(viewport.x, viewport.y);
    context.scale(viewport.scale, viewport.scale);
    const styles = getComputedStyle(canvas);
    const foreground = styles.getPropertyValue('--vscode-foreground').trim() || '#cccccc';
    const border = styles.getPropertyValue('--vscode-panel-border').trim() || '#555555';
    const accent = styles.getPropertyValue('--vscode-focusBorder').trim() || '#00b7c3';
    const clusters = new Map<string, { x: number; y: number; count: number }>();
    for (const entity of entities) {
      const point = pointsRef.current.get(entity.id);
      if (!point) continue;
      const key = entity.projectId ?? entity.kind;
      const cluster = clusters.get(key) ?? { x: 0, y: 0, count: 0 };
      cluster.x += point.x;
      cluster.y += point.y;
      cluster.count += 1;
      clusters.set(key, cluster);
    }
    context.globalAlpha = presentation ? 0.1 : 0.065;
    for (const cluster of clusters.values()) {
      const x = cluster.x / cluster.count;
      const y = cluster.y / cluster.count;
      const radius = Math.min(155, 44 + Math.sqrt(cluster.count) * 15);
      const halo = context.createRadialGradient(x, y, 0, x, y, radius);
      halo.addColorStop(0, accent);
      halo.addColorStop(1, 'transparent');
      context.fillStyle = halo;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 0.34;
    context.lineWidth = 1 / viewport.scale;
    for (const relation of relations) {
      const from = pointsRef.current.get(relation.from);
      const to = pointsRef.current.get(relation.to);
      if (!from || !to) continue;
      const active =
        relation.from === selectedId ||
        relation.to === selectedId ||
        highlightedSet.has(relation.from) ||
        highlightedSet.has(relation.to);
      context.strokeStyle = active ? accent : relationColor(relation.kind, border);
      context.globalAlpha = active ? 0.82 : 0.3;
      context.lineWidth = (active ? 1.8 : 1) / viewport.scale;
      const curve = ((hashCode(relation.id) % 21) - 10) * 1.8;
      const midX = (from.x + to.x) / 2;
      const midY = (from.y + to.y) / 2;
      const distance = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
      const controlX = midX - ((to.y - from.y) / distance) * curve;
      const controlY = midY + ((to.x - from.x) / distance) * curve;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.quadraticCurveTo(controlX, controlY, to.x, to.y);
      context.stroke();
    }
    context.globalAlpha = 1;
    for (const entity of entities) {
      const point = pointsRef.current.get(entity.id);
      if (!point) continue;
      const selected = entity.id === selectedId;
      const highlighted = highlightedSet.has(entity.id);
      const degree = degreeById.get(entity.id) ?? 0;
      const core = ['workspace', 'project', 'service'].includes(entity.kind);
      const radius = NODE_RADIUS + Math.min(5, Math.sqrt(degree)) + (core ? 2 : 0);
      const pulse =
        highlighted && animationTime < 2600
          ? 4 + (Math.sin((animationTime / 700) * Math.PI * 2) + 1) * 3
          : 0;
      if (pulse > 0) {
        context.beginPath();
        context.arc(point.x, point.y, radius + pulse, 0, Math.PI * 2);
        context.strokeStyle = accent;
        context.globalAlpha = Math.max(0, 0.7 - animationTime / 3800);
        context.lineWidth = 2 / viewport.scale;
        context.stroke();
        context.globalAlpha = 1;
      }
      context.beginPath();
      context.arc(point.x, point.y, selected ? radius + 3 : radius, 0, Math.PI * 2);
      context.fillStyle = selected ? accent : colorForKind(entity.kind, foreground, accent);
      context.shadowColor = selected || highlighted ? accent : 'transparent';
      context.shadowBlur = (selected || highlighted ? 15 : 0) / viewport.scale;
      context.fill();
      context.shadowBlur = 0;
      if (selected) {
        context.strokeStyle = foreground;
        context.lineWidth = 1.5 / viewport.scale;
        context.stroke();
      }
      if ((selected || highlighted || core || (presentation && degree >= 4)) && viewport.scale > 0.36) {
        context.font = `${selected ? 600 : 500} ${Math.max(9, 11 / viewport.scale)}px system-ui`;
        context.fillStyle = foreground;
        context.globalAlpha = selected || highlighted ? 1 : 0.72;
        context.fillText(entity.label.slice(0, 30), point.x + radius + 5, point.y + 4);
        context.globalAlpha = 1;
      }
    }
    context.restore();
  }, [
    animationTime,
    degreeById,
    entities,
    highlightedSet,
    layoutRevision,
    presentation,
    relations,
    selectedId,
    size,
    viewport,
  ]);

  const selectAt = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (clientX - rect.left - viewport.x) / viewport.scale;
    const y = (clientY - rect.top - viewport.y) / viewport.scale;
    let nearest: { id: string; distance: number } | null = null;
    for (const entity of entities) {
      const point = pointsRef.current.get(entity.id);
      if (!point) continue;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance <= 16 / viewport.scale && (!nearest || distance < nearest.distance)) {
        nearest = { id: entity.id, distance };
      }
    }
    if (nearest) onSelect(nearest.id);
  };

  return (
    <div ref={containerRef} className="workspace-graph-canvas">
      <div className="workspace-graph-canvas__chrome">
        <span>
          <i className="is-core" /> Architecture
        </span>
        <span>
          <i className="is-api" /> APIs
        </span>
        <span>
          <i className="is-data" /> Data
        </span>
        <button type="button" onClick={() => fitToLayout()} aria-label="Fit graph to view">
          Fit
        </button>
      </div>
      <canvas
        ref={canvasRef}
        aria-label={`Interactive workspace graph with ${entities.length} entities and ${relations.length} relationships`}
        tabIndex={0}
        onWheel={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          const nextScale = Math.max(
            0.18,
            Math.min(4, viewport.scale * (event.deltaY > 0 ? 0.9 : 1.1))
          );
          const pointerX = event.clientX - rect.left;
          const pointerY = event.clientY - rect.top;
          setViewport({
            scale: nextScale,
            x: pointerX - ((pointerX - viewport.x) / viewport.scale) * nextScale,
            y: pointerY - ((pointerY - viewport.y) / viewport.scale) * nextScale,
          });
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY, origin: viewport, moved: false };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          setViewport({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy });
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (drag && !drag.moved) selectAt(event.clientX, event.clientY);
        }}
      />
      <span className="workspace-graph-canvas__hint">
        Drag to pan · Scroll to zoom · Select a node
      </span>
    </div>
  );
}

function colorForKind(kind: string, fallback: string, accent: string): string {
  if (['workspace', 'project', 'service'].includes(kind)) return accent;
  if (['api', 'endpoint'].includes(kind)) return '#4ec9b0';
  if (['database', 'queue'].includes(kind)) return '#c586c0';
  if (['pipeline', 'deployment', 'container'].includes(kind)) return '#dcdcaa';
  return fallback;
}

function relationColor(kind: string, fallback: string): string {
  if (/depend|call|import/i.test(kind)) return '#22d3ee';
  if (/deploy|run|host/i.test(kind)) return '#f59e0b';
  if (/document|evidence|proof/i.test(kind)) return '#a78bfa';
  return fallback;
}

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }
  return Math.abs(hash);
}
