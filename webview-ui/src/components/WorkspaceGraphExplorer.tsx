import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  Download,
  FileSearch,
  FolderOpen,
  Maximize2,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
} from 'lucide-react';
import {
  findWorkspaceGraphProjection,
  type WorkspaceGraphEntityProjection,
  type WorkspaceGraphProjection,
} from '@workspai-contracts/workspaceGraphProjection';
import type { DashboardEvidencePayload } from '@/lib/dashboardEvidence';
import {
  DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS,
  type WorkspaceGraphRecordingFrameInput,
  type WorkspaceGraphRecordingStartInput,
  type WorkspaceGraphRecordingState,
  type WorkspaceGraphRecordingStopInput,
} from '@workspai-contracts/workspaceGraphRecording';
import {
  detectWorkspaceGraphRendererCapabilities,
  resolveWorkspaceGraphRenderer,
} from '@/lib/workspaceGraphRenderer';
import {
  captureWorkspaceGraphSurface,
  describeWorkspaceGraphRecordingChange,
  WorkspaceGraphWebmRecorder,
} from '@/lib/workspaceGraphRecording';
import { WorkspaiEmptyState } from './WorkspaiEmptyState';
import { WorkspaceGraphCanvas } from './WorkspaceGraphCanvas';
import { WorkspaceGraphWebgl } from './WorkspaceGraphWebgl';

type GraphMode = 'explore' | 'architecture';
type GraphView = 'map' | '3d' | 'list';

const ARCHITECTURE_KINDS = new Set([
  'workspace',
  'project',
  'service',
  'api',
  'endpoint',
  'schema',
  'protocol',
  'language',
  'package',
  'runtime-unit',
  'lifecycle-stage',
  'database',
  'queue',
  'container',
  'deployment',
  'pipeline',
  'environment',
  'decision',
  'test-suite',
  'owner',
]);

function graphFromEvidence(
  evidence: DashboardEvidencePayload | null
): WorkspaceGraphProjection | null {
  const model = evidence?.cards.find((card) => card.id === 'workspaceModel');
  return findWorkspaceGraphProjection(model?.detailSections);
}

function entitySearchText(entity: WorkspaceGraphEntityProjection): string {
  return [entity.label, entity.id, entity.kind, entity.projectId, entity.path]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function qualityPercent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

function formatMemory(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRecordingElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(
    2,
    '0'
  )}`;
}

function proofPathLabel(artifact: string): string {
  const normalized = artifact.replace(/\\/g, '/');
  if (normalized.startsWith('external/')) {
    const [, projectId, ...rest] = normalized.split('/');
    return [projectId, ...rest].filter(Boolean).join(' › ');
  }
  if (normalized.startsWith('redacted/')) {
    return `${normalized.slice('redacted/'.length)} · location hidden`;
  }
  return normalized;
}

function readableMetricName(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function attributeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
}

export function WorkspaceGraphExplorer({
  evidence,
  liveGraph,
  streamStatus,
  streamStats,
  memorySample,
  recordingState,
  workspacePath,
  hasWorkspace,
  onRefresh,
  onSearchCanonical,
  onExport,
  onRevealArtifact,
  onStartRecording,
  onAppendRecordingFrame,
  onStopRecording,
  onOpenRecording,
}: {
  evidence: DashboardEvidencePayload | null;
  liveGraph?: WorkspaceGraphProjection | null;
  streamStatus?: string;
  streamStats?: { received: number; emitted: number; coalesced: number } | null;
  memorySample?: {
    estimatedBytes: number;
    budgetBytes: number;
    utilizationRatio: number;
    exceeded: boolean;
  } | null;
  recordingState?: WorkspaceGraphRecordingState | null;
  workspacePath?: string;
  hasWorkspace: boolean;
  onRefresh: () => void;
  onSearchCanonical: () => void;
  onExport: (format: 'jsonld' | 'graphml' | 'gexf') => void;
  onRevealArtifact: (path: string) => void;
  onStartRecording: (input: WorkspaceGraphRecordingStartInput) => void;
  onAppendRecordingFrame: (input: WorkspaceGraphRecordingFrameInput) => void;
  onStopRecording: (input: WorkspaceGraphRecordingStopInput) => void;
  onOpenRecording: () => void;
}) {
  const graph = useMemo(() => {
    const persistedGraph = graphFromEvidence(evidence);
    if (!liveGraph) {
      return persistedGraph;
    }
    return {
      ...liveGraph,
      workspace: liveGraph.workspace ?? persistedGraph?.workspace,
      source: liveGraph.source ?? persistedGraph?.source,
    };
  }, [evidence, liveGraph]);
  const [mode, setMode] = useState<GraphMode>('explore');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [project, setProject] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [view, setView] = useState<GraphView>('map');
  const [presentation, setPresentation] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [recordingLocallyStopping, setRecordingLocallyStopping] = useState(false);
  const [recordingCaptureError, setRecordingCaptureError] = useState<string | null>(null);
  const captureRootRef = useRef<HTMLDivElement | null>(null);
  const capturedGraphRef = useRef<WorkspaceGraphProjection | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureInFlightRef = useRef<Promise<void>>(Promise.resolve());
  const webmRecorderRef = useRef<WorkspaceGraphWebmRecorder | null>(null);
  const activeRecordingSessionRef = useRef<string | null>(null);
  const onAppendRecordingFrameRef = useRef(onAppendRecordingFrame);
  const onStopRecordingRef = useRef(onStopRecording);
  onAppendRecordingFrameRef.current = onAppendRecordingFrame;
  onStopRecordingRef.current = onStopRecording;
  const [rendererCapabilities] = useState(detectWorkspaceGraphRendererCapabilities);
  const fallbackToMap = useCallback(() => setView('map'), []);
  const renderer = resolveWorkspaceGraphRenderer(
    view === '3d' ? 'webgl3d' : view === 'map' ? 'canvas2d' : 'list',
    rendererCapabilities
  );
  const availableViews: GraphView[] = ['map', '3d', 'list'];

  const kinds = useMemo(
    () => [...new Set(graph?.entities.map((entity) => entity.kind) ?? [])].sort(),
    [graph]
  );
  const projects = useMemo(
    () =>
      [
        ...new Set(graph?.entities.map((entity) => entity.projectId).filter(Boolean) ?? []),
      ].sort() as string[],
    [graph]
  );
  const neighborhoodIds = useMemo(() => {
    if (!isolatedId || !graph) {
      return null;
    }
    const ids = new Set([isolatedId]);
    for (const relation of graph.relations) {
      if (relation.from === isolatedId) {
        ids.add(relation.to);
      }
      if (relation.to === isolatedId) {
        ids.add(relation.from);
      }
    }
    return ids;
  }, [graph, isolatedId]);
  const entities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (graph?.entities ?? []).filter((entity) => {
      if (neighborhoodIds && !neighborhoodIds.has(entity.id)) return false;
      if (mode === 'architecture' && !ARCHITECTURE_KINDS.has(entity.kind)) return false;
      if (kind !== 'all' && entity.kind !== kind) return false;
      if (project !== 'all' && entity.projectId !== project && entity.id !== project) return false;
      return !normalizedQuery || entitySearchText(entity).includes(normalizedQuery);
    });
  }, [graph, kind, mode, neighborhoodIds, project, query]);
  const visibleIds = useMemo(() => new Set(entities.map((entity) => entity.id)), [entities]);
  const relations = useMemo(
    () =>
      (graph?.relations ?? []).filter(
        (relation) => visibleIds.has(relation.from) && visibleIds.has(relation.to)
      ),
    [graph, visibleIds]
  );
  const selected = graph?.entities.find((entity) => entity.id === selectedId) ?? null;
  const selectedRelations = selected
    ? (graph?.relations.filter(
        (relation) => relation.from === selected.id || relation.to === selected.id
      ) ?? [])
    : [];
  const selectedProofIds = new Set([
    ...(selected?.proofIds ?? []),
    ...selectedRelations.flatMap((relation) => relation.proofIds),
  ]);
  const selectedProofs = selected
    ? (graph?.proofs.filter((proof) => selectedProofIds.has(proof.id)) ?? [])
    : [];
  const entityById = useMemo(
    () => new Map((graph?.entities ?? []).map((entity) => [entity.id, entity])),
    [graph]
  );
  const languages = useMemo(
    () =>
      [
        ...new Set(
          (graph?.entities ?? [])
            .filter((entity) => entity.kind === 'language')
            .map((entity) => entity.label)
        ),
      ].sort(),
    [graph]
  );
  const runtimeUnits = useMemo(
    () => (graph?.entities ?? []).filter((entity) => entity.kind === 'runtime-unit').length,
    [graph]
  );
  const providerStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const provider of graph?.providers ?? []) {
      const status = provider.status ?? 'unknown';
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [graph]);
  const bindingCoverage = Object.entries(graph?.quality.bindingCoverage ?? {});
  const selectedAttributes = selected
    ? Object.entries(selected.attributes).filter(([, value]) => value !== null && value !== '')
    : [];
  const isRecording = recordingState?.status === 'recording';
  const isRecordingBusy =
    recordingLocallyStopping ||
    recordingState?.status === 'starting' ||
    recordingState?.status === 'stopping';

  useEffect(() => {
    const sessionId = recordingState?.sessionId;
    if (recordingState?.status === 'recording' && sessionId) {
      if (activeRecordingSessionRef.current !== sessionId) {
        activeRecordingSessionRef.current = sessionId;
        capturedGraphRef.current = null;
        webmRecorderRef.current = WorkspaceGraphWebmRecorder.create();
        setPresentation(true);
        setRecordingCaptureError(null);
        setRecordingLocallyStopping(false);
        if (view === 'list') {
          setView('map');
        }
      }
      return;
    }
    if (recordingState?.status === 'ready' || recordingState?.status === 'error') {
      activeRecordingSessionRef.current = null;
      setRecordingLocallyStopping(false);
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    }
  }, [recordingState?.sessionId, recordingState?.status, view]);

  useEffect(() => {
    if (!isRecording || recordingLocallyStopping || !recordingState?.sessionId || !graph) {
      return;
    }
    const change = describeWorkspaceGraphRecordingChange(capturedGraphRef.current, graph);
    if (!change) {
      return;
    }
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
    }
    captureTimerRef.current = setTimeout(() => {
      const capture = captureInFlightRef.current
        .catch(() => undefined)
        .then(async () => {
          const root = captureRootRef.current;
          const queuedChange = describeWorkspaceGraphRecordingChange(
            capturedGraphRef.current,
            graph
          );
          if (!root || !queuedChange) {
            return;
          }
          const frame = await captureWorkspaceGraphSurface(root);
          await webmRecorderRef.current?.addFrame(frame.pngDataUrl);
          onAppendRecordingFrameRef.current({
            sessionId: recordingState.sessionId as string,
            revision: graph.revision,
            capturedAt: new Date().toISOString(),
            ...frame,
            change: queuedChange,
          });
          capturedGraphRef.current = graph;
          setRecordingCaptureError(null);
        })
        .catch((error: unknown) => {
          setRecordingCaptureError(error instanceof Error ? error.message : String(error));
        });
      captureInFlightRef.current = capture;
    }, DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.stableFrameDelayMs);
    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, [graph, isRecording, recordingLocallyStopping, recordingState?.sessionId, renderer]);

  useEffect(() => {
    if (!isRecording || !recordingState?.startedAt) {
      setRecordingElapsedMs(0);
      return;
    }
    const update = () => {
      const elapsed = Math.max(0, Date.now() - Date.parse(recordingState.startedAt as string));
      setRecordingElapsedMs(elapsed);
      if (
        elapsed >= DEFAULT_WORKSPACE_GRAPH_RECORDING_LIMITS.maxDurationMs &&
        !recordingLocallyStopping
      ) {
        setRecordingLocallyStopping(true);
        void captureInFlightRef.current
          .then(() => webmRecorderRef.current?.stop())
          .then((webmDataUrl) => {
            onStopRecording({
              sessionId: recordingState.sessionId as string,
              webmDataUrl,
            });
            webmRecorderRef.current = null;
          });
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [
    isRecording,
    onStopRecording,
    recordingLocallyStopping,
    recordingState?.sessionId,
    recordingState?.startedAt,
  ]);

  useEffect(() => {
    const sessionId = recordingState?.status === 'recording' ? recordingState.sessionId : undefined;
    if (!sessionId) {
      return;
    }
    return () => {
      if (activeRecordingSessionRef.current !== sessionId) {
        return;
      }
      activeRecordingSessionRef.current = null;
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
      }
      void captureInFlightRef.current
        .then(() => webmRecorderRef.current?.stop())
        .then((webmDataUrl) => {
          onStopRecordingRef.current({ sessionId, webmDataUrl });
          webmRecorderRef.current = null;
        });
    };
  }, [recordingState?.sessionId, recordingState?.status]);

  const stopRecording = useCallback(async () => {
    if (!recordingState?.sessionId || recordingLocallyStopping) {
      return;
    }
    setRecordingLocallyStopping(true);
    await captureInFlightRef.current;
    const webmDataUrl = await webmRecorderRef.current?.stop().catch(() => undefined);
    webmRecorderRef.current = null;
    onStopRecording({ sessionId: recordingState.sessionId, webmDataUrl });
  }, [onStopRecording, recordingLocallyStopping, recordingState?.sessionId]);

  if (!hasWorkspace) {
    return (
      <section id="ws-graph-panel" role="tabpanel" aria-labelledby="ws-dashboard-tab-graph">
        <WorkspaiEmptyState
          icon={<Network size={18} />}
          title="Open a workspace to explore its graph"
          description="The explorer reads the canonical evidence-backed graph produced by Workspai."
        />
      </section>
    );
  }

  if (!graph) {
    return (
      <section id="ws-graph-panel" role="tabpanel" aria-labelledby="ws-dashboard-tab-graph">
        <WorkspaiEmptyState
          icon={<Network size={18} />}
          title="Workspace Graph has not been generated"
          description="Generate or refresh the Workspace Model to create the canonical graph artifact."
          actions={
            <button type="button" className="ws-btn ws-btn--primary" onClick={onRefresh}>
              <RefreshCw size={13} /> Generate graph
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section
      id="ws-graph-panel"
      role="tabpanel"
      aria-labelledby="ws-dashboard-tab-graph"
      className="workspace-graph-explorer"
    >
      <header className="workspace-graph-explorer__header">
        <div>
          <span className="workspace-graph-explorer__eyebrow">Canonical workspace projection</span>
          <h2>Workspace Graph</h2>
          <p>
            {graph.total.entities} entities · {graph.total.relations} relationships ·{' '}
            {graph.total.proofs} proofs
          </p>
          {streamStatus ? (
            <small>
              Live stream · {streamStatus}
              {streamStats?.coalesced ? ` · ${streamStats.coalesced} burst updates merged` : ''}
            </small>
          ) : null}
        </div>
        <div className="workspace-graph-explorer__revision" title={graph.revision}>
          <ShieldCheck size={14} />
          <span>{graph.truncated ? 'Bounded view' : 'Complete view'}</span>
          <code>{graph.revision.slice(0, 9)}</code>
        </div>
      </header>

      <div className="workspace-graph-explorer__toolbar" aria-label="Workspace Graph controls">
        <label className="workspace-graph-explorer__search">
          <Search size={14} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an entity in this revision"
            aria-label="Find an entity in this graph revision"
          />
        </label>
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          aria-label="Entity kind"
        >
          <option value="all">All kinds</option>
          {kinds.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        {projects.length ? (
          <select
            value={project}
            onChange={(event) => setProject(event.target.value)}
            aria-label="Project cluster"
          >
            <option value="all">All projects</option>
            {projects.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : null}
        {isolatedId ? (
          <button
            type="button"
            className="ws-btn ws-btn--quiet"
            onClick={() => setIsolatedId(null)}
            title="Return to the complete bounded projection"
          >
            Clear focus
          </button>
        ) : null}
        <div className="workspace-graph-explorer__modes" role="group" aria-label="Graph mode">
          {(['explore', 'architecture'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={mode === value ? 'is-active' : ''}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === 'explore' ? 'Explore' : 'Architecture'}
            </button>
          ))}
        </div>
        <div className="workspace-graph-explorer__modes" role="group" aria-label="Graph view">
          {availableViews.map((value) => (
            <button
              key={value}
              type="button"
              className={view === value ? 'is-active' : ''}
              aria-pressed={view === value}
              disabled={value === '3d' && !rendererCapabilities.webgl2}
              onClick={() => setView(value)}
              title={
                value === '3d' && !rendererCapabilities.webgl2
                  ? '3D requires WebGL2 in the VS Code window'
                  : undefined
              }
            >
              {value === 'map' ? 'Map' : value === '3d' ? '3D' : 'List'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ws-btn"
          onClick={onSearchCanonical}
          title="Run bounded canonical graph search"
        >
          <FileSearch size={13} /> Search source
        </button>
        <button
          type="button"
          className="ws-btn"
          onClick={onRefresh}
          title="Refresh canonical evidence"
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <button
          type="button"
          className={`ws-btn ${presentation ? 'is-active' : ''}`}
          aria-pressed={presentation}
          onClick={() => setPresentation((value) => !value)}
          title="Use a cleaner, expanded graph surface for demos and captures"
        >
          {presentation ? <Sparkles size={13} /> : <Maximize2 size={13} />} Present
        </button>
        {isRecording ? (
          <button
            type="button"
            className="ws-btn workspace-graph-recording-button is-recording"
            onClick={() => void stopRecording()}
            disabled={isRecordingBusy}
            title="Stop and finalize this graph story"
          >
            <Square size={11} fill="currentColor" />
            {recordingLocallyStopping
              ? 'Finalizing…'
              : `${formatRecordingElapsed(recordingElapsedMs)} · ${recordingState.frameCount} change(s)`}
          </button>
        ) : (
          <button
            type="button"
            className="ws-btn workspace-graph-recording-button"
            disabled={!workspacePath || isRecordingBusy || view === 'list'}
            onClick={() => {
              if (workspacePath) {
                onStartRecording({
                  workspacePath,
                  mode: 'change-driven',
                  initialRevision: graph.revision,
                });
              }
            }}
            title={
              view === 'list'
                ? 'Switch to Map or 3D before recording'
                : 'Record meaningful graph revisions'
            }
          >
            <Circle size={12} fill="currentColor" /> Record
          </button>
        )}
        <details className="workspace-graph-explorer__export">
          <summary>
            <Download size={13} /> Export
          </summary>
          <div>
            <button type="button" onClick={() => onExport('jsonld')}>
              JSON-LD
            </button>
            <button type="button" onClick={() => onExport('graphml')}>
              GraphML
            </button>
            <button type="button" onClick={() => onExport('gexf')}>
              GEXF
            </button>
          </div>
        </details>
      </div>

      {recordingState?.status === 'ready' || recordingState?.status === 'error' || isRecording ? (
        <div
          className={`workspace-graph-recording-status is-${recordingState?.status ?? 'idle'}`}
          role="status"
        >
          <span>
            {isRecording
              ? 'Recording meaningful revisions'
              : recordingState?.status === 'ready'
                ? 'Graph story ready'
                : 'Recording stopped'}
          </span>
          <small>
            {recordingCaptureError ??
              recordingState?.message ??
              `${recordingState?.frameCount ?? 0} captured frame(s)`}
          </small>
          {recordingState?.outputPath ? (
            <button type="button" className="ws-btn ws-btn--quiet" onClick={onOpenRecording}>
              <FolderOpen size={12} /> Open folder
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="workspace-graph-explorer__quality" aria-label="Graph quality">
        <span>Entity proof {qualityPercent(graph.quality.entityProofCoverageRatio)}</span>
        <span>Relation proof {qualityPercent(graph.quality.relationProofCoverageRatio)}</span>
        <span>Provider success {qualityPercent(graph.quality.providerSuccessRatio)}</span>
        <span>{graph.diagnostics.length} diagnostic(s)</span>
        <span>{graph.quality.conflictCount ?? 0} conflict(s)</span>
        <span>{graph.quality.unknownCount ?? 0} unknown(s)</span>
        {memorySample ? (
          <span
            className={memorySample.exceeded ? 'is-danger' : ''}
            title={`${Math.round(memorySample.utilizationRatio * 100)}% of the retained graph memory budget`}
          >
            Memory {formatMemory(memorySample.estimatedBytes)} /{' '}
            {formatMemory(memorySample.budgetBytes)}
          </span>
        ) : null}
      </div>

      <div className="workspace-graph-explorer__coverage" aria-label="Graph coverage summary">
        <article>
          <span>Language coverage</span>
          <strong>{languages.length || '—'}</strong>
          <small>
            {languages.length ? languages.join(' · ') : 'No language entities reported'}
          </small>
        </article>
        <article>
          <span>Runtime topology</span>
          <strong>{runtimeUnits}</strong>
          <small>
            {projects.length} project cluster(s) · {graph.source?.scopes.length ?? 0} indexed
            scope(s)
          </small>
        </article>
        <article>
          <span>Provider health</span>
          <strong>{graph.providers.length}</strong>
          <small>
            {providerStatus.get('passed') ?? 0} passed · {providerStatus.get('partial') ?? 0}{' '}
            partial · {providerStatus.get('skipped') ?? 0} skipped ·{' '}
            {providerStatus.get('failed') ?? 0} failed
          </small>
        </article>
        <article>
          <span>Input fingerprint</span>
          <strong>{graph.source?.strategy ?? 'not reported'}</strong>
          <small>
            {!graph.source?.scopes.length
              ? 'No source scope metadata reported'
              : graph.source.scopes.some((scope) => scope.truncated)
                ? 'One or more source scopes are bounded'
                : 'All reported source scopes are complete'}
          </small>
        </article>
      </div>

      {graph.providers.length > 0 || bindingCoverage.length > 0 || graph.diagnostics.length > 0 ? (
        <details className="workspace-graph-explorer__intelligence">
          <summary>Provider, binding, and diagnostic intelligence</summary>
          <div className="workspace-graph-explorer__intelligence-grid">
            {graph.providers.length > 0 ? (
              <section>
                <h3>Providers</h3>
                {graph.providers.map((provider) => (
                  <div key={provider.id} className={`is-${provider.status ?? 'unknown'}`}>
                    <strong>{provider.id}</strong>
                    <span>{provider.status ?? 'unknown'}</span>
                    <small>
                      {provider.discoveredEntities ?? 0} entities ·{' '}
                      {provider.discoveredRelations ?? 0} relations · {provider.proofCount ?? 0}{' '}
                      proofs
                    </small>
                    {provider.diagnostics.map((diagnostic) => (
                      <small key={diagnostic}>{diagnostic}</small>
                    ))}
                  </div>
                ))}
              </section>
            ) : null}
            {bindingCoverage.length > 0 ? (
              <section>
                <h3>Semantic bindings</h3>
                {bindingCoverage.map(([name, coverage]) => (
                  <div key={name}>
                    <strong>{readableMetricName(name)}</strong>
                    <span>{qualityPercent(coverage.coverageRatio)}</span>
                    <small>
                      {coverage.boundCount}/{coverage.eligibleCount} bound · {coverage.unknownCount}{' '}
                      unknown
                    </small>
                  </div>
                ))}
              </section>
            ) : null}
            {graph.source?.scopes.length ? (
              <section>
                <h3>Source scopes</h3>
                {graph.source.scopes.map((scope) => (
                  <div
                    key={`${scope.kind}:${scope.id}`}
                    className={scope.truncated ? 'is-warning' : ''}
                  >
                    <strong>{scope.id}</strong>
                    <span>{scope.kind}</span>
                    <small>
                      {scope.strategy ?? 'unknown strategy'} · {scope.fileCount ?? 0}/
                      {scope.fileLimit ?? '—'} files {scope.truncated ? '· bounded' : '· complete'}
                    </small>
                  </div>
                ))}
              </section>
            ) : null}
            {graph.diagnostics.length > 0 ? (
              <section>
                <h3>Diagnostics</h3>
                {graph.diagnostics.map((diagnostic, index) => (
                  <div key={`${diagnostic.code}:${index}`} className={`is-${diagnostic.severity}`}>
                    <strong>{diagnostic.code}</strong>
                    <span>{diagnostic.severity}</span>
                    <small>{diagnostic.message}</small>
                    {diagnostic.recommendation ? <small>{diagnostic.recommendation}</small> : null}
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        </details>
      ) : null}

      <div
        className={`workspace-graph-explorer__body ${presentation ? 'is-presentation' : ''}`}
        data-renderer={renderer}
      >
        <div
          ref={captureRootRef}
          className="workspace-graph-explorer__canvas"
          aria-label="Workspace graph entities"
        >
          <div className="workspace-graph-explorer__canvas-meta">
            <span>{entities.length} visible entities</span>
            <span>{relations.length} visible relationships</span>
          </div>
          {entities.length && renderer === 'canvas2d' ? (
            <WorkspaceGraphCanvas
              entities={entities}
              relations={relations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              highlightedIds={graph.highlightedEntityIds ?? []}
              presentation={presentation}
            />
          ) : entities.length && renderer === 'webgl3d' ? (
            <WorkspaceGraphWebgl
              key={
                graph.entities.find((entity) => entity.kind === 'workspace')?.id ?? graph.revision
              }
              entities={entities}
              relations={relations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              presentation={presentation && !rendererCapabilities.prefersReducedMotion}
              onFallback={fallbackToMap}
              preferenceKey={
                graph.entities.find((entity) => entity.kind === 'workspace')?.id ?? graph.revision
              }
            />
          ) : entities.length ? (
            <div className="workspace-graph-explorer__entity-grid">
              {entities.map((entity) => {
                const degree = relations.filter(
                  (relation) => relation.from === entity.id || relation.to === entity.id
                ).length;
                return (
                  <button
                    key={entity.id}
                    type="button"
                    className={selectedId === entity.id ? 'is-selected' : ''}
                    onClick={() => setSelectedId(entity.id)}
                    aria-pressed={selectedId === entity.id}
                  >
                    <span className={`workspace-graph-explorer__entity-kind kind-${entity.kind}`}>
                      {entity.kind}
                    </span>
                    <strong>{entity.label}</strong>
                    <small>
                      {degree} relation(s) · {entity.proofIds.length} proof(s)
                    </small>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="workspace-graph-explorer__no-results">
              No entity matches this bounded view.
            </p>
          )}
        </div>

        <aside
          className="workspace-graph-explorer__drawer"
          aria-label="Selected entity details"
          aria-hidden={presentation}
        >
          {selected ? (
            <>
              <span className="workspace-graph-explorer__eyebrow">{selected.kind}</span>
              <h3>{selected.label}</h3>
              <code>{selected.id}</code>
              <dl>
                <div>
                  <dt>Scope</dt>
                  <dd>{selected.scope ?? 'unknown'}</dd>
                </div>
                <div>
                  <dt>Relations</dt>
                  <dd>{selectedRelations.length}</dd>
                </div>
                <div>
                  <dt>Proofs</dt>
                  <dd>{selectedProofs.length}</dd>
                </div>
                {selected.projectId ? (
                  <div>
                    <dt>Project</dt>
                    <dd>{selected.projectId}</dd>
                  </div>
                ) : null}
              </dl>
              <button
                type="button"
                className="ws-btn workspace-graph-explorer__focus-action"
                onClick={() => {
                  const shouldIsolate = isolatedId !== selected.id;
                  setIsolatedId(shouldIsolate ? selected.id : null);
                  if (shouldIsolate) {
                    setQuery('');
                    setKind('all');
                    setProject('all');
                  }
                }}
              >
                {isolatedId === selected.id ? 'Show complete view' : 'Isolate neighborhood'}
              </button>
              {selectedRelations.length ? (
                <div className="workspace-graph-explorer__drawer-section">
                  <strong>Relationships</strong>
                  {selectedRelations.slice(0, 12).map((relation) => (
                    <span key={relation.id}>
                      {relation.from === selected.id ? '→' : '←'} {relation.kind} ·{' '}
                      {entityById.get(relation.from === selected.id ? relation.to : relation.from)
                        ?.label ?? (relation.from === selected.id ? relation.to : relation.from)}
                      <small>
                        {[relation.derivation, relation.trust, relation.confidence]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  ))}
                </div>
              ) : null}
              {selectedAttributes.length > 0 ? (
                <div className="workspace-graph-explorer__drawer-section">
                  <strong>Attributes</strong>
                  {selectedAttributes.slice(0, 16).map(([name, value]) => (
                    <span key={name}>
                      {readableMetricName(name)} · {attributeValue(value)}
                    </span>
                  ))}
                </div>
              ) : null}
              {selectedProofs.length ? (
                <div className="workspace-graph-explorer__drawer-section">
                  <strong>Proof paths</strong>
                  {selectedProofs.map((proof) => (
                    <button
                      key={proof.id}
                      type="button"
                      onClick={() => proof.artifact && onRevealArtifact(proof.artifact)}
                      disabled={!proof.artifact || proof.artifact.startsWith('redacted/')}
                    >
                      {proof.artifact ? proofPathLabel(proof.artifact) : proof.id}
                      {proof.line ? `:${proof.line}${proof.column ? `:${proof.column}` : ''}` : ''}
                      <small>
                        {[
                          proof.provider,
                          proof.derivation,
                          proof.trust,
                          proof.confidence,
                          proof.freshness,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                      {proof.pointer ? <small>Pointer · {proof.pointer}</small> : null}
                      {proof.observedAt ? <small>Observed · {proof.observedAt}</small> : null}
                      {proof.detail ? <small>{proof.detail}</small> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p>No proof path is attached to this entity.</p>
              )}
            </>
          ) : (
            <div className="workspace-graph-explorer__drawer-empty">
              <Network size={20} />
              <strong>Select an entity</strong>
              <span>Inspect its identity, relationships, and evidence.</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
