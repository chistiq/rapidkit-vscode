export type GraphLayoutNode = { id: string; kind: string; projectId?: string };
export type GraphLayoutEdge = { from: string; to: string };
export type GraphLayoutPoint = { id: string; x: number; y: number; z: number };
export type GraphLayoutRequest = {
  requestId: number;
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
  width?: number;
  height?: number;
};
export type GraphLayoutResult = {
  requestId: number;
  points: GraphLayoutPoint[];
  width: number;
  height: number;
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function layoutWorkspaceGraph(request: GraphLayoutRequest): GraphLayoutResult {
  const width = request.width ?? 1200;
  const height = request.height ?? 800;
  const nodes = request.nodes.slice(0, 500);
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const x = new Float64Array(nodes.length);
  const y = new Float64Array(nodes.length);
  const groups = new Map<string, number>();
  for (const node of nodes) {
    const group = node.projectId ?? node.kind;
    if (!groups.has(group)) {
      groups.set(group, groups.size);
    }
  }
  const groupCount = Math.max(1, groups.size);
  nodes.forEach((node, index) => {
    const groupIndex = groups.get(node.projectId ?? node.kind) ?? 0;
    const groupAngle = (groupIndex / groupCount) * Math.PI * 2;
    const seed = hash(node.id);
    const radius = 90 + (seed % 170);
    const jitter = ((seed % 1000) / 1000) * Math.PI * 2;
    const centerRadius = Math.min(width, height) * 0.28;
    x[index] = width / 2 + Math.cos(groupAngle) * centerRadius + Math.cos(jitter) * radius;
    y[index] = height / 2 + Math.sin(groupAngle) * centerRadius + Math.sin(jitter) * radius;
  });

  const edges = request.edges.flatMap((edge) => {
    const from = indexById.get(edge.from);
    const to = indexById.get(edge.to);
    return from === undefined || to === undefined ? [] : [[from, to] as const];
  });
  const iterations = nodes.length > 300 ? 45 : 70;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const dx = new Float64Array(nodes.length);
    const dy = new Float64Array(nodes.length);
    for (const [from, to] of edges) {
      const vx = x[to] - x[from];
      const vy = y[to] - y[from];
      const distance = Math.max(1, Math.hypot(vx, vy));
      const force = (distance - 92) * 0.018;
      dx[from] += (vx / distance) * force;
      dy[from] += (vy / distance) * force;
      dx[to] -= (vx / distance) * force;
      dy[to] -= (vy / distance) * force;
    }
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const vx = x[right] - x[left];
        const vy = y[right] - y[left];
        const distanceSquared = vx * vx + vy * vy + 0.01;
        if (distanceSquared > 32_400) {
          continue;
        }
        const distance = Math.sqrt(distanceSquared);
        const force = Math.min(5, 850 / distanceSquared);
        dx[left] -= (vx / distance) * force;
        dy[left] -= (vy / distance) * force;
        dx[right] += (vx / distance) * force;
        dy[right] += (vy / distance) * force;
      }
    }
    const cooling = 1 - iteration / iterations;
    for (let index = 0; index < nodes.length; index += 1) {
      dx[index] += (width / 2 - x[index]) * 0.002;
      dy[index] += (height / 2 - y[index]) * 0.002;
      x[index] = Math.max(28, Math.min(width - 28, x[index] + dx[index] * cooling));
      y[index] = Math.max(28, Math.min(height - 28, y[index] + dy[index] * cooling));
    }
  }

  return {
    requestId: request.requestId,
    width,
    height,
    points: nodes.map((node, index) => {
      const seed = hash(`${node.id}:depth`);
      const groupIndex = groups.get(node.projectId ?? node.kind) ?? 0;
      return {
        id: node.id,
        x: x[index],
        y: y[index],
        z: ((seed % 401) - 200) * 0.72 + (groupIndex - groupCount / 2) * 18,
      };
    }),
  };
}
