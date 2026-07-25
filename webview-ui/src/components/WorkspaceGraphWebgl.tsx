import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  DEFAULT_WORKSPACE_GRAPH_CAMERA,
  readWorkspaceGraphCameraPreference,
  writeWorkspaceGraphCameraPreference,
  type WorkspaceGraphCameraPreference,
  type WorkspaceGraphPreferenceState,
} from '@/lib/workspaceGraphPreferences';
import { projectWorkspaceGraphPoint3d } from '@/lib/workspaceGraph3d';
import { vscode } from '@/vscode';

type Camera = WorkspaceGraphCameraPreference;
type RenderResources = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  colorBuffer: WebGLBuffer;
  positionLocation: number;
  colorLocation: number;
  pointSizeLocation: WebGLUniformLocation;
  pointsLocation: WebGLUniformLocation;
};
type ProjectedPoint = { id: string; x: number; y: number };

const VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec4 a_color;
uniform float u_pointSize;
out vec4 v_color;
void main() {
  gl_Position = vec4(a_position, 1.0);
  gl_PointSize = u_pointSize;
  v_color = a_color;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec4 v_color;
uniform bool u_points;
out vec4 outColor;
void main() {
  if (u_points) {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float distanceSquared = dot(point, point);
    if (distanceSquared > 1.0) discard;
    float glow = 1.0 - smoothstep(0.45, 1.0, distanceSquared);
    outColor = vec4(v_color.rgb, v_color.a * (0.55 + glow * 0.45));
    return;
  }
  outColor = v_color;
}`;

export function WorkspaceGraphWebgl({
  entities,
  relations,
  selectedId,
  onSelect,
  presentation,
  onFallback,
  preferenceKey,
}: {
  entities: WorkspaceGraphEntityProjection[];
  relations: WorkspaceGraphRelationProjection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  presentation: boolean;
  onFallback: () => void;
  preferenceKey: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resourcesRef = useRef<RenderResources | null>(null);
  const pointsRef = useRef<Map<string, GraphLayoutPoint>>(new Map());
  const projectedRef = useRef<ProjectedPoint[]>([]);
  const requestRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; camera: Camera; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [layoutSize, setLayoutSize] = useState({ width: 1200, height: 800 });
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [camera, setCamera] = useState<Camera>(() =>
    readWorkspaceGraphCameraPreference(
      vscode.getState<WorkspaceGraphPreferenceState>(),
      preferenceKey
    )
  );

  const resetCamera = useCallback(() => {
    setCamera(DEFAULT_WORKSPACE_GRAPH_CAMERA);
  }, []);

  useEffect(() => {
    vscode.setState(
      writeWorkspaceGraphCameraPreference(
        vscode.getState<WorkspaceGraphPreferenceState>(),
        preferenceKey,
        camera
      )
    );
  }, [camera, preferenceKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(380, Math.floor(entry.contentRect.height)),
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      onFallback();
      return;
    }
    let resources: RenderResources;
    try {
      resources = createRenderResources(gl);
    } catch {
      onFallback();
      return;
    }
    resourcesRef.current = resources;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onFallback();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    setLayoutRevision((value) => value + 1);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      resourcesRef.current = null;
      gl.deleteBuffer(resources.positionBuffer);
      gl.deleteBuffer(resources.colorBuffer);
      gl.deleteProgram(resources.program);
    };
  }, [onFallback]);

  useEffect(() => {
    let disposed = false;
    let workerHandle: WorkspaceGraphWorkerHandle | null = null;
    const request: GraphLayoutRequest = {
      requestId: ++requestRef.current,
      nodes: entities.map(({ id, kind, projectId }) => ({ id, kind, projectId })),
      edges: relations.map(({ from, to }) => ({ from, to })),
      width: 1200,
      height: 800,
    };
    const accept = (result: GraphLayoutResult) => {
      if (disposed || result.requestId !== requestRef.current) {
        return;
      }
      pointsRef.current = new Map(result.points.map((point) => [point.id, point]));
      setLayoutSize({ width: result.width, height: result.height });
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
        handle.worker.onerror = () => accept(layoutWorkspaceGraph(request));
        handle.worker.postMessage(request);
      })
      .catch(() => accept(layoutWorkspaceGraph(request)));
    return () => {
      disposed = true;
      workerHandle?.dispose();
    };
  }, [entities, relations]);

  useEffect(() => {
    const resources = resourcesRef.current;
    const canvas = canvasRef.current;
    if (!resources || !canvas) {
      return;
    }
    let animationFrame = 0;
    const startedAt = performance.now();
    const draw = (now: number) => {
      renderWorkspaceGraph3d(resources, {
        canvas,
        labelsCanvas: labelsCanvasRef.current,
        size,
        layoutSize,
        points: pointsRef.current,
        entities,
        relations,
        selectedId,
        camera: {
          ...camera,
          yaw: camera.yaw + (presentation ? (now - startedAt) * 0.000045 : 0),
        },
        projected: projectedRef.current,
      });
      if (presentation) {
        animationFrame = requestAnimationFrame(draw);
      }
    };
    draw(performance.now());
    return () => cancelAnimationFrame(animationFrame);
  }, [
    camera,
    entities,
    layoutRevision,
    layoutSize,
    presentation,
    relations,
    selectedId,
    size,
  ]);

  return (
    <div ref={containerRef} className="workspace-graph-webgl">
      <div className="workspace-graph-webgl__chrome">
        <strong>WebGL 3D</strong>
        <span>Drag to orbit · Scroll to zoom</span>
        <button type="button" onClick={resetCamera}>
          Reset view
        </button>
      </div>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={`Interactive 3D workspace graph with ${entities.length} entities and ${relations.length} relationships`}
        onWheel={(event) => {
          event.preventDefault();
          setCamera((current) => ({
            ...current,
            zoom: Math.max(0.24, Math.min(2.6, current.zoom * (event.deltaY > 0 ? 0.9 : 1.1))),
          }));
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            camera,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag) {
            return;
          }
          const dx = event.clientX - drag.x;
          const dy = event.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) {
            drag.moved = true;
          }
          setCamera({
            ...drag.camera,
            yaw: drag.camera.yaw + dx * 0.006,
            pitch: Math.max(-1.25, Math.min(1.25, drag.camera.pitch + dy * 0.006)),
          });
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          dragRef.current = null;
          if (!drag || drag.moved) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const nearest = projectedRef.current
            .map((point) => ({ ...point, distance: Math.hypot(point.x - x, point.y - y) }))
            .filter((point) => point.distance <= 18)
            .sort((left, right) => left.distance - right.distance)[0];
          if (nearest) {
            onSelect(nearest.id);
          }
        }}
      />
      <canvas ref={labelsCanvasRef} className="workspace-graph-webgl__labels" aria-hidden="true" />
    </div>
  );
}

function createRenderResources(gl: WebGL2RenderingContext): RenderResources {
  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
  const positionBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const pointSizeLocation = gl.getUniformLocation(program, 'u_pointSize');
  const pointsLocation = gl.getUniformLocation(program, 'u_points');
  if (!positionBuffer || !colorBuffer || !pointSizeLocation || !pointsLocation) {
    if (positionBuffer) {
      gl.deleteBuffer(positionBuffer);
    }
    if (colorBuffer) {
      gl.deleteBuffer(colorBuffer);
    }
    gl.deleteProgram(program);
    throw new Error('Could not allocate Workspace Graph WebGL resources');
  }
  return {
    gl,
    program,
    positionBuffer,
    colorBuffer,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    colorLocation: gl.getAttribLocation(program, 'a_color'),
    pointSizeLocation,
    pointsLocation,
  };
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Could not create Workspace Graph WebGL program');
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'unknown WebGL link error';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Could not create Workspace Graph WebGL shader');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'unknown WebGL compile error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function renderWorkspaceGraph3d(
  resources: RenderResources,
  input: {
    canvas: HTMLCanvasElement;
    labelsCanvas: HTMLCanvasElement | null;
    size: { width: number; height: number };
    layoutSize: { width: number; height: number };
    points: Map<string, GraphLayoutPoint>;
    entities: WorkspaceGraphEntityProjection[];
    relations: WorkspaceGraphRelationProjection[];
    selectedId: string | null;
    camera: Camera;
    projected: ProjectedPoint[];
  }
): void {
  const { gl } = resources;
  const ratio = window.devicePixelRatio || 1;
  input.canvas.width = Math.floor(input.size.width * ratio);
  input.canvas.height = Math.floor(input.size.height * ratio);
  input.canvas.style.width = `${input.size.width}px`;
  input.canvas.style.height = `${input.size.height}px`;
  gl.viewport(0, 0, input.canvas.width, input.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.useProgram(resources.program);

  const projected = new Map<string, { clip: [number, number, number]; screen: [number, number] }>();
  input.projected.length = 0;
  for (const entity of input.entities) {
    const point = input.points.get(entity.id);
    if (!point) {
      continue;
    }
    const value = projectWorkspaceGraphPoint3d(
      point,
      input.layoutSize,
      input.size,
      input.camera
    );
    projected.set(entity.id, value);
    input.projected.push({ id: entity.id, x: value.screen[0], y: value.screen[1] });
  }

  const linePositions: number[] = [];
  const lineColors: number[] = [];
  for (const relation of input.relations) {
    const from = projected.get(relation.from);
    const to = projected.get(relation.to);
    if (!from || !to) {
      continue;
    }
    const color = relationColor3d(relation.kind);
    linePositions.push(...from.clip, ...to.clip);
    lineColors.push(...color, ...color);
  }
  uploadAndDraw(resources, linePositions, lineColors, gl.LINES, 1, false);

  const nodePositions: number[] = [];
  const nodeColors: number[] = [];
  const selectedPositions: number[] = [];
  const selectedColors: number[] = [];
  for (const entity of input.entities) {
    const point = projected.get(entity.id);
    if (!point) {
      continue;
    }
    const color = entityColor3d(entity.kind);
    if (entity.id === input.selectedId) {
      selectedPositions.push(...point.clip);
      selectedColors.push(1, 1, 1, 1);
    } else {
      nodePositions.push(...point.clip);
      nodeColors.push(...color);
    }
  }
  uploadAndDraw(resources, nodePositions, nodeColors, gl.POINTS, 8 * ratio, true);
  const corePositions: number[] = [];
  const coreColors: number[] = [];
  for (const entity of input.entities) {
    if (!['workspace', 'project', 'service'].includes(entity.kind) || entity.id === input.selectedId) {
      continue;
    }
    const point = projected.get(entity.id);
    if (point) {
      corePositions.push(...point.clip);
      coreColors.push(...entityColor3d(entity.kind));
    }
  }
  uploadAndDraw(resources, corePositions, coreColors, gl.POINTS, 13 * ratio, true);
  uploadAndDraw(resources, selectedPositions, selectedColors, gl.POINTS, 17 * ratio, true);
  if (input.labelsCanvas) {
    renderWorkspaceGraphLabels(
      input.labelsCanvas,
      input.size,
      input.entities,
      projected,
      input.selectedId
    );
  }
}

function uploadAndDraw(
  resources: RenderResources,
  positions: number[],
  colors: number[],
  mode: number,
  pointSize: number,
  points: boolean
): void {
  if (!positions.length) {
    return;
  }
  const { gl } = resources;
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(resources.positionLocation);
  gl.vertexAttribPointer(resources.positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, resources.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(resources.colorLocation);
  gl.vertexAttribPointer(resources.colorLocation, 4, gl.FLOAT, false, 0, 0);
  gl.uniform1f(resources.pointSizeLocation, pointSize);
  gl.uniform1i(resources.pointsLocation, points ? 1 : 0);
  gl.drawArrays(mode, 0, positions.length / 3);
}

function entityColor3d(kind: string): [number, number, number, number] {
  if (['workspace', 'project', 'service'].includes(kind)) return [0.13, 0.83, 0.93, 0.98];
  if (['api', 'endpoint'].includes(kind)) return [0.31, 0.79, 0.69, 0.95];
  if (['database', 'queue'].includes(kind)) return [0.77, 0.53, 0.75, 0.95];
  if (['pipeline', 'deployment', 'container'].includes(kind)) return [0.86, 0.86, 0.67, 0.95];
  return [0.66, 0.71, 0.8, 0.82];
}

function relationColor3d(kind: string): [number, number, number, number] {
  if (/depend|call|import/i.test(kind)) return [0.13, 0.83, 0.93, 0.24];
  if (/deploy|run|host/i.test(kind)) return [0.96, 0.62, 0.04, 0.3];
  if (/document|evidence|proof/i.test(kind)) return [0.65, 0.55, 0.98, 0.28];
  return [0.58, 0.64, 0.73, 0.18];
}

function renderWorkspaceGraphLabels(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number },
  entities: WorkspaceGraphEntityProjection[],
  projected: Map<string, { clip: [number, number, number]; screen: [number, number] }>,
  selectedId: string | null
): void {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(size.width * ratio);
  canvas.height = Math.floor(size.height * ratio);
  canvas.style.width = `${size.width}px`;
  canvas.style.height = `${size.height}px`;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);
  context.font = '600 10px system-ui';
  for (const entity of entities) {
    const important = ['workspace', 'project', 'service'].includes(entity.kind);
    if (!important && entity.id !== selectedId) {
      continue;
    }
    const point = projected.get(entity.id);
    if (!point) {
      continue;
    }
    const label = entity.label.slice(0, 34);
    const width = context.measureText(label).width + 12;
    const x = Math.min(size.width - width - 4, point.screen[0] + 9);
    const y = Math.max(15, Math.min(size.height - 8, point.screen[1] - 9));
    context.fillStyle =
      entity.id === selectedId ? 'rgba(8, 47, 73, 0.94)' : 'rgba(15, 23, 42, 0.76)';
    context.strokeStyle =
      entity.id === selectedId ? 'rgba(34, 211, 238, 0.95)' : 'rgba(148, 163, 184, 0.28)';
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(x, y - 12, width, 18, 5);
    context.fill();
    context.stroke();
    context.fillStyle = entity.id === selectedId ? '#ecfeff' : '#cbd5e1';
    context.fillText(label, x + 6, y + 1);
  }
}
