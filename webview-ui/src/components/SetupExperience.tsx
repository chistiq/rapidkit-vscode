import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clipboard,
    FolderSearch,
    Gauge,
    RefreshCw,
    Save,
    Wrench,
    Zap,
} from 'lucide-react';
import { brandMonogramStyle, wsBrand } from '@/lib/workspaiBrandTokens';
import { vscode } from '@/vscode';

// ─── Types ────────────────────────────────────────────────────────────────────

type SetupStatus = {
    pythonInstalled?: boolean;
    pythonVersion?: string | null;
    pythonNeedsUpgrade?: boolean;
    pipInstalled?: boolean;
    pipVersion?: string | null;
    pipxInstalled?: boolean;
    pipxVersion?: string | null;
    poetryInstalled?: boolean;
    poetryVersion?: string | null;
    goInstalled?: boolean;
    goVersion?: string | null;
    goPath?: string | null;
    dotnetInstalled?: boolean;
    dotnetVersion?: string | null;
    dotnetPath?: string | null;
    javaInstalled?: boolean;
    javaVersion?: string | null;
    mavenInstalled?: boolean;
    mavenVersion?: string | null;
    gradleInstalled?: boolean;
    gradleVersion?: string | null;
    npmInstalled?: boolean;
    npmVersion?: string | null;
    npmAvailableViaNpx?: boolean;
    coreInstalled?: boolean;
    coreVersion?: string | null;
    coreInstallType?: 'global' | 'workspace' | null;
    latestNpmVersion?: string | null;
    latestCoreVersion?: string | null;
    latestCoreStable?: string | null;
    manualPaths?: Partial<Record<ManualPathTool, string>>;
    installMethods?: Partial<Record<InstallMethodKey, string>>;
    detections?: Partial<Record<ManualPathTool | 'core' | 'cli', SetupDetection>>;
};

type DetectionSource = 'manual-path' | 'path' | 'fallback' | 'workspace';
type SetupDetection = {
    source: DetectionSource;
    command: string;
    note?: string;
    needsShellReload?: boolean;
};

type ManualPathTool =
    | 'python'
    | 'pip'
    | 'pipx'
    | 'poetry'
    | 'go'
    | 'java'
    | 'maven'
    | 'gradle'
    | 'dotnet';
type InstallMethodKey = 'python' | 'core' | 'cli' | 'go' | 'java' | 'dotnet';

type PathDoctorReport = {
    generatedAt: string;
    shell: string;
    shellName: string;
    targetFile?: string;
    pathEntries: string[];
    missingCommonEntries: string[];
    suggestions: Array<{
        id: string;
        title: string;
        snippet: string;
        targetFile?: string;
        requiresReload?: 'shell' | 'window' | 'none';
        reason?: string;
    }>;
    notes: string[];
    needsShellReload: boolean;
};

type SetupCheckResult = {
    tool: ManualPathTool;
    command: string;
    ok: boolean;
    output: string;
    summary: string;
    reason:
    | 'manual-path-empty'
    | 'not-found'
    | 'not-executable'
    | 'permission'
    | 'command-not-found'
    | 'path-missing'
    | 'version-mismatch'
    | 'unknown';
    suggestedCommands: string[];
    targetFile?: string;
    requiresReload?: 'shell' | 'window' | 'none';
};

type SetupPreferences = {
    manualPaths: Partial<Record<ManualPathTool, string>>;
    installMethods: Partial<Record<InstallMethodKey, string>>;
    lastPathDoctorReport?: PathDoctorReport | null;
};

declare global {
    interface Window {
        RAPIDKIT_ICON_URI?: string;
        PYTHON_ICON_URI?: string;
        PYPI_ICON_URI?: string;
        NPM_ICON_URI?: string;
        GO_ICON_URI?: string;
        SPRING_ICON_URI?: string;
        POETRY_ICON_URI?: string;
    }
}

type ToolDef = {
    key: string;
    monogram: string;
    iconSrc?: string;
    color: string;
    title: string;
    subtitle: string;
    required?: boolean;
    installed: boolean;
    version?: string | null;
    warning?: boolean;
    hint?: string;
    canUpgrade?: boolean;
    detection?: SetupDetection;
    primaryAction?: { label: string; command: string; data?: Record<string, unknown> };
    secondaryActions?: { label: string; command: string }[];
};

const MANUAL_PATH_TOOLS: Array<{
    key: ManualPathTool;
    label: string;
    placeholder: string;
    verifyCommand: string;
}> = [
        { key: 'python', label: 'Python', placeholder: '/usr/bin/python3', verifyCommand: 'verifyPython' },
        { key: 'pip', label: 'pip', placeholder: '/usr/bin/pip3', verifyCommand: 'verifyPip' },
        { key: 'pipx', label: 'pipx', placeholder: '/usr/local/bin/pipx', verifyCommand: 'verifyPipx' },
        { key: 'poetry', label: 'Poetry', placeholder: '~/.local/bin/poetry', verifyCommand: 'verifyPoetry' },
        { key: 'go', label: 'Go', placeholder: '/usr/local/go/bin/go', verifyCommand: 'verifyGo' },
        { key: 'dotnet', label: '.NET', placeholder: '/usr/bin/dotnet', verifyCommand: 'verifyDotnet' },
        { key: 'java', label: 'Java', placeholder: '/usr/bin/java', verifyCommand: 'verifyJava' },
        { key: 'maven', label: 'Maven', placeholder: '/usr/bin/mvn', verifyCommand: 'verifyMaven' },
        { key: 'gradle', label: 'Gradle', placeholder: '/usr/bin/gradle', verifyCommand: 'verifyGradle' },
    ];

const INSTALL_METHOD_OPTIONS = [
    { value: 'recommended', label: 'Recommended' },
    { value: 'latest', label: 'Latest' },
    { value: 'stable', label: 'Stable' },
    { value: 'enterprise', label: 'Enterprise-safe' },
];

function parseSemver(version?: string | null) {
    if (!version) {return null;}
    const cleaned = version.trim().replace(/^v/i, '');
    const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) {return null;}
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

function hasNewerVersion(current?: string | null, latest?: string | null) {
    const c = parseSemver(current);
    const l = parseSemver(latest);
    if (!c || !l) {return false;}
    if (l.major !== c.major) {return l.major > c.major;}
    if (l.minor !== c.minor) {return l.minor > c.minor;}
    return l.patch > c.patch;
}

function detectionLabel(source?: DetectionSource) {
    switch (source) {
        case 'manual-path':
            return 'Detected via manual path';
        case 'path':
            return 'Detected via PATH';
        case 'fallback':
            return 'Detected via fallback';
        case 'workspace':
            return 'Detected in workspace';
        default:
            return null;
    }
}

// ─── SVG Progress Ring ────────────────────────────────────────────────────────

function ProgressRing({ value, max }: { value: number; max: number }) {
    const r = 38;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - (max === 0 ? 0 : value / max));
    const allDone = value === max && max > 0;

    return (
        <div className="spc-ring-wrap">
            <svg width="96" height="96" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r={r} fill="none" strokeWidth="5" className="spc-ring-track" />
                <circle
                    cx="48" cy="48" r={r} fill="none" strokeWidth="5"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    transform="rotate(-90 48 48)"
                    className={'spc-ring-arc' + (allDone ? ' done' : '')}
                    style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
                />
            </svg>
            <div className="spc-ring-label">
                <span className={'spc-ring-value' + (allDone ? ' done' : '')}>{value}/{max}</span>
                <span className="spc-ring-caption">Core Ready</span>
            </div>
        </div>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard({ monogram, iconSrc, title, color }: { monogram: string; iconSrc?: string; title: string; color: string }) {
    return (
        <div className="spc-skeleton-card" aria-hidden={true}>
            <div className="spc-skeleton-head">
                <Monogram letters={monogram} iconSrc={iconSrc} color={color} />
                <div className="spc-skeleton-meta">
                    <div className="spc-skeleton-title">{title}</div>
                    <div className="spc-skeleton-line" />
                </div>
            </div>
            <div className="spc-skeleton-line short" />
            <div className="spc-skeleton-actions">
                <span className="spc-skeleton-chip" />
                <span className="spc-skeleton-chip" />
            </div>
        </div>
    );
}

// ─── Monogram Badge ───────────────────────────────────────────────────────────

function Monogram({ letters, iconSrc, color }: { letters: string; iconSrc?: string; color: string }) {
    return (
        <div
            className="spc-monogram"
            style={brandMonogramStyle(color)}
        >
            {iconSrc ? <img src={iconSrc} alt={letters} className="spc-monogram-icon" /> : letters}
        </div>
    );
}

// ─── Tool Card ────────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: ToolDef }) {
    const { installed, warning, version, hint, required, canUpgrade, detection } = tool;
    const badgeText = installed ? 'Installed' : required ? 'Required' : 'Optional';
    const badgeMod = installed ? 'ok' : required ? 'req' : 'opt';
    const shouldShowPrimary = Boolean(tool.primaryAction && (!installed || canUpgrade || warning));
    const primaryLabel = installed ? 'Upgrade' : tool.primaryAction?.label;
    const detectionText = detectionLabel(detection?.source);

    return (
        <article className={'spc-card' + (installed ? ' ok' : '') + (warning ? ' warn' : '')}>
            <div className="spc-card-head">
                <Monogram letters={tool.monogram} iconSrc={tool.iconSrc} color={tool.color} />
                <div className="spc-card-info">
                    <div className="spc-card-title">{tool.title}</div>
                    <div className="spc-card-sub">{tool.subtitle}</div>
                </div>
                <span className={'spc-badge spc-badge-' + badgeMod}>{badgeText}</span>
            </div>

            <div className="spc-card-status">
                {installed ? (
                    <>
                        <span className="spc-dot ok" />
                        <span className="spc-version">{version ? 'v' + version : 'Detected'}</span>
                        {detectionText && <span className="ws-chip ws-chip--muted">{detectionText}</span>}
                    </>
                ) : (
                    <>
                        <AlertTriangle size={13} className="spc-warn-icon" />
                        <span className="spc-hint">{hint || 'Not detected in current environment'}</span>
                    </>
                )}
            </div>

            <div className="spc-card-actions">
                {shouldShowPrimary && tool.primaryAction && (
                    <button
                        className="ws-btn ws-btn--primary"
                        onClick={() => vscode.postMessage(tool.primaryAction!.command, tool.primaryAction!.data)}
                    >
                        {primaryLabel}
                    </button>
                )}
                {tool.secondaryActions?.map(a => (
                    <button key={a.command} className="ws-btn" onClick={() => vscode.postMessage(a.command)}>
                        {a.label}
                    </button>
                ))}
            </div>
        </article>
    );
}

// ─── Tool Group ───────────────────────────────────────────────────────────────

function ToolGroup({ title, tools, loading }: { title: string; tools: ToolDef[]; loading: boolean }) {
    const [open, setOpen] = useState(true);
    const ready = tools.filter(t => t.installed).length;
    const allReady = ready === tools.length;

    return (
        <section className="spc-group">
            <button className="spc-group-header" onClick={() => setOpen(v => !v)}>
                <span className="spc-group-title">{title}</span>
                <span className={'spc-group-tally' + (allReady ? ' ok' : '')}>
                    {allReady && <CheckCircle2 size={12} />}
                    {ready}/{tools.length}
                </span>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {open && (
                <div className="spc-group-grid">
                    {loading
                        ? tools.map((tool) => (
                            <SkeletonCard
                                key={tool.key}
                                monogram={tool.monogram}
                                iconSrc={tool.iconSrc}
                                title={tool.title}
                                color={tool.color}
                            />
                        ))
                        : tools.map(t => <ToolCard key={t.key} tool={t} />)
                    }
                </div>
            )}
        </section>
    );
}

// ─── All-Set Banner ───────────────────────────────────────────────────────────

function AllSetBanner() {
    return (
        <div className="spc-allset">
            <Zap size={18} className="spc-allset-icon" />
            <div>
                <div className="spc-allset-title">All systems ready</div>
                <div className="spc-allset-sub">
                    Your dev environment is fully configured for all Workspai workflows.
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SetupExperience({
    embedded = false,
}: {
    embedded?: boolean;
}) {
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [insightsOpen, setInsightsOpen] = useState(true);
    const [preferences, setPreferences] = useState<SetupPreferences>({ manualPaths: {}, installMethods: {} });
    const [manualDrafts, setManualDrafts] = useState<Partial<Record<ManualPathTool, string>>>({});
    const [pathDoctor, setPathDoctor] = useState<PathDoctorReport | null>(null);
    const [validationResult, setValidationResult] = useState<SetupCheckResult | null>(null);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const msg = event.data;
            if (msg?.command === 'statusUpdate') {
                setStatus(msg.status ?? null);
                setRefreshing(false);
            }
            if (msg?.command === 'preferencesUpdate') {
                const next = msg.preferences as SetupPreferences;
                setPreferences(next ?? { manualPaths: {}, installMethods: {} });
            }
            if (msg?.command === 'pathDoctorUpdate') {
                setPathDoctor((msg.report as PathDoctorReport) || null);
            }
            if (msg?.command === 'manualPathPicked') {
                const key = msg.tool as ManualPathTool;
                const pickedPath = (msg.path as string) || '';
                if (!key) {
                    return;
                }
                setManualDrafts((prev) => ({ ...prev, [key]: pickedPath }));
            }
            if (msg?.command === 'manualPathValidation') {
                setValidationResult((msg.result as SetupCheckResult) || null);
            }
        };
        window.addEventListener('message', onMessage);
        setRefreshing(true);
        vscode.postMessage('checkInstallStatus');
        vscode.postMessage('getSetupPreferences');
        vscode.postMessage('runPathDoctor');
        return () => window.removeEventListener('message', onMessage);
    }, []);

    useEffect(() => {
        if (!status) {
            return;
        }
        if (status.manualPaths || status.installMethods) {
            setPreferences((prev) => ({
                manualPaths: { ...prev.manualPaths, ...(status.manualPaths || {}) },
                installMethods: { ...prev.installMethods, ...(status.installMethods || {}) },
                lastPathDoctorReport: prev.lastPathDoctorReport,
            }));
        }
    }, [status]);

    const refresh = useCallback(() => {
        setRefreshing(true);
        vscode.postMessage('checkInstallStatus');
        vscode.postMessage('runPathDoctor');
    }, []);

    const setManualDraft = useCallback((tool: ManualPathTool, value: string) => {
        setManualDrafts((prev) => ({ ...prev, [tool]: value }));
    }, []);

    const saveManualPath = useCallback((tool: ManualPathTool) => {
        const draftValue = manualDrafts[tool] ?? preferences.manualPaths[tool] ?? '';
        if (!draftValue.trim()) {
            return;
        }
        vscode.postMessage('setManualPath', { tool, path: draftValue.trim() });
    }, [manualDrafts, preferences.manualPaths]);

    const clearManualPath = useCallback((tool: ManualPathTool) => {
        setManualDrafts((prev) => ({ ...prev, [tool]: '' }));
        vscode.postMessage('clearManualPath', { tool });
    }, []);

    const validateManualPath = useCallback((tool: ManualPathTool) => {
        const draftValue = manualDrafts[tool] ?? preferences.manualPaths[tool] ?? '';
        vscode.postMessage('validateManualPath', { tool, path: draftValue.trim() });
    }, [manualDrafts, preferences.manualPaths]);

    const coreTools = useMemo<ToolDef[]>(() => {
        const s = status;
        const pythonOk = Boolean(s?.pythonInstalled && !s?.pythonNeedsUpgrade);
        const coreLatest = s?.latestCoreStable || s?.latestCoreVersion;
        const coreUpgradeable = hasNewerVersion(s?.coreVersion, coreLatest);
        const cliUpgradeable = hasNewerVersion(s?.npmVersion, s?.latestNpmVersion);
        return [
            {
                key: 'python', monogram: 'PY', iconSrc: window.PYTHON_ICON_URI, color: wsBrand.python,
                title: 'Python 3.10+', subtitle: 'Required for RapidKit Core',
                required: true, installed: pythonOk, version: s?.pythonVersion,
                detection: s?.detections?.python,
                warning: Boolean(s?.pythonInstalled && s?.pythonNeedsUpgrade),
                hint: (s?.pythonInstalled && s?.pythonNeedsUpgrade)
                    ? 'Installed but upgrade to 3.10+ recommended'
                    : (preferences.manualPaths.python ? `Manual path: ${preferences.manualPaths.python}` : 'Download from python.org'),
                canUpgrade: Boolean(s?.pythonInstalled && s?.pythonNeedsUpgrade),
                primaryAction: { label: 'Install', command: 'openUrl', data: { url: 'https://www.python.org/downloads/' } },
                secondaryActions: [{ label: 'Verify', command: 'verifyPython' }],
            },
            {
                key: 'core', monogram: 'WS', iconSrc: window.RAPIDKIT_ICON_URI, color: wsBrand.core,
                title: 'RapidKit Core', subtitle: 'Python engine for scaffolding',
                required: true, installed: Boolean(s?.coreInstalled), version: s?.coreVersion,
                detection: s?.detections?.core,
                hint: s?.coreInstallType === 'workspace'
                    ? 'Workspace-only install (global recommended)'
                    : 'Required for all scaffold and lifecycle commands',
                canUpgrade: coreUpgradeable,
                primaryAction: { label: 'Install', command: coreUpgradeable ? 'upgradePipCore' : 'installCoreSmart' },
                secondaryActions: [{ label: 'Verify', command: 'verifyCore' }],
            },
            {
                key: 'cli', monogram: 'RK', iconSrc: window.NPM_ICON_URI, color: wsBrand.cli,
                title: 'RapidKit CLI', subtitle: 'Node.js bridge for workspace commands',
                required: true, installed: Boolean(s?.npmInstalled || s?.npmAvailableViaNpx), version: s?.npmVersion,
                detection: s?.detections?.cli,
                hint: 'Install globally via npm',
                canUpgrade: cliUpgradeable,
                primaryAction: { label: 'Install', command: cliUpgradeable ? 'upgradeNpmGlobal' : 'installNpmGlobal' },
                secondaryActions: [{ label: 'Verify', command: 'verifyNpm' }],
            },
        ];
    }, [status]);

    const pythonTools = useMemo<ToolDef[]>(() => {
        const s = status;
        return [
            {
                key: 'pip', monogram: 'pip', iconSrc: window.PYPI_ICON_URI, color: wsBrand.pip,
                title: 'pip', subtitle: 'Python package installer',
                installed: Boolean(s?.pipInstalled), version: s?.pipVersion,
                detection: s?.detections?.pip,
                hint: 'Usually bundled with Python',
                secondaryActions: [{ label: 'Verify', command: 'verifyPip' }],
            },
            {
                key: 'pipx', monogram: 'px', iconSrc: window.PYPI_ICON_URI, color: wsBrand.pipx,
                title: 'pipx', subtitle: 'Isolated global tool installs',
                installed: Boolean(s?.pipxInstalled), version: s?.pipxVersion,
                detection: s?.detections?.pipx,
                hint: 'Recommended for cleaner global installs',
                primaryAction: { label: 'Install', command: 'installPipx' },
                secondaryActions: [{ label: 'Verify', command: 'verifyPipx' }],
            },
            {
                key: 'poetry', monogram: 'Po', iconSrc: window.POETRY_ICON_URI, color: wsBrand.poetry,
                title: 'Poetry', subtitle: 'Dependency manager for FastAPI projects',
                installed: Boolean(s?.poetryInstalled), version: s?.poetryVersion,
                detection: s?.detections?.poetry,
                hint: 'Used in FastAPI workspace templates',
                primaryAction: { label: 'Install', command: 'installPoetry' },
                secondaryActions: [{ label: 'Verify', command: 'verifyPoetry' }],
            },
        ];
    }, [status]);

    const goTools = useMemo<ToolDef[]>(() => {
        const s = status;
        return [
            {
                key: 'go', monogram: 'Go', iconSrc: window.GO_ICON_URI, color: wsBrand.go,
                title: 'Go', subtitle: 'Runtime for GoFiber and GoGin projects',
                installed: Boolean(s?.goInstalled), version: s?.goVersion,
                detection: s?.detections?.go,
                hint: s?.goInstalled
                    ? (s.goPath || 'Detected in environment')
                    : (preferences.manualPaths.go
                        ? `Manual path configured: ${preferences.manualPaths.go}`
                        : 'If installed, reload VS Code so PATH updates apply'),
                primaryAction: { label: 'Install', command: 'openUrl', data: { url: 'https://go.dev/dl/' } },
                secondaryActions: [{ label: 'Verify', command: 'verifyGo' }],
            },
        ];
    }, [status, preferences.manualPaths.go, preferences.manualPaths.python]);

    const javaTools = useMemo<ToolDef[]>(() => {
        const s = status;
        const javaOk = Boolean(s?.javaInstalled);
        const javaVersionStr = s?.javaVersion ?? null;
        const javaMajor = javaVersionStr ? parseInt(javaVersionStr.split('.')[0], 10) : null;
        const javaVersionOk = javaMajor !== null && !isNaN(javaMajor) && javaMajor >= 17;
        const javaHint = !javaOk
            ? 'Install Temurin 21+ (Adoptium) or use SDKMAN: sdk install java 21-tem'
            : !javaVersionOk
                ? `JDK ${javaVersionStr} detected — Spring Boot 3+ requires JDK 17+. Upgrade recommended.`
                : 'Java runtime ready for Spring Boot projects';
        return [
            {
                key: 'java', monogram: 'Jv', iconSrc: window.SPRING_ICON_URI, color: wsBrand.java,
                title: 'Java (JDK 17+)', subtitle: 'Spring Boot runtime',
                installed: javaOk && javaVersionOk,
                version: javaVersionStr,
                detection: s?.detections?.java,
                hint: javaHint,
                primaryAction: { label: 'Install', command: 'installJava' },
                secondaryActions: [
                    { label: 'Verify', command: 'verifyJava' },
                    { label: 'Verify All', command: 'verifyJavaEnv' },
                ],
            },
            {
                key: 'maven', monogram: 'Mv', iconSrc: window.SPRING_ICON_URI, color: wsBrand.maven,
                title: 'Maven', subtitle: 'Spring Boot build tool',
                installed: Boolean(s?.mavenInstalled), version: s?.mavenVersion,
                detection: s?.detections?.maven,
                hint: 'Maven or Gradle — at least one required for Spring Boot. Install via: sdk install maven',
                primaryAction: { label: 'Install', command: 'installMaven' },
                secondaryActions: [{ label: 'Verify', command: 'verifyMaven' }],
            },
            {
                key: 'gradle', monogram: 'Gr', iconSrc: window.SPRING_ICON_URI, color: wsBrand.gradle,
                title: 'Gradle', subtitle: 'Spring Boot build tool',
                installed: Boolean(s?.gradleInstalled), version: s?.gradleVersion,
                detection: s?.detections?.gradle,
                hint: 'Maven or Gradle — at least one required for Spring Boot. Install via: sdk install gradle',
                primaryAction: { label: 'Install', command: 'installGradle' },
                secondaryActions: [{ label: 'Verify', command: 'verifyGradle' }],
            },
        ];
    }, [status]);

    const dotnetTools = useMemo<ToolDef[]>(() => {
        const s = status;
        return [
            {
                key: 'dotnet', monogram: '.NET', color: wsBrand.dotnet,
                title: '.NET SDK 8+', subtitle: 'ASP.NET Core runtime',
                installed: Boolean(s?.dotnetInstalled), version: s?.dotnetVersion,
                detection: s?.detections?.dotnet,
                hint: s?.dotnetInstalled
                    ? (s.dotnetPath || 'Detected in environment')
                    : (preferences.manualPaths.dotnet
                        ? `Manual path configured: ${preferences.manualPaths.dotnet}`
                        : 'Install .NET SDK 8+ for dotnet.webapi.clean projects'),
                primaryAction: { label: 'Install', command: 'installDotnet' },
                secondaryActions: [{ label: 'Verify', command: 'verifyDotnet' }],
            },
        ];
    }, [status, preferences.manualPaths.dotnet]);

    const coreReady = useMemo(() => coreTools.filter(t => t.installed).length, [coreTools]);
    const allTools = useMemo(
        () => [...coreTools, ...pythonTools, ...goTools, ...dotnetTools, ...javaTools],
        [coreTools, pythonTools, goTools, dotnetTools, javaTools]
    );
    const allReady = useMemo(() => allTools.every(t => t.installed), [allTools]);
    const readinessScore = useMemo(() => {
        if (allTools.length === 0) {
            return 0;
        }
        const installedCount = allTools.filter((tool) => tool.installed).length;
        return Math.round((installedCount / allTools.length) * 100);
    }, [allTools]);

    const readinessGaps = useMemo(() => {
        return allTools
            .filter((tool) => !tool.installed)
            .slice(0, 5)
            .map((tool) => `${tool.title}: ${tool.hint || 'Not detected'}`);
    }, [allTools]);

    const aiInsights = useMemo(() => {
        const suggestions: string[] = [];
        const s = status;

        if (validationResult) {
            suggestions.push(validationResult.summary);
        }
        if (!s?.pythonInstalled) {
            suggestions.push('Python missing. Install Python 3.10+ first, then rerun Setup checks.');
        }
        if (s?.pythonInstalled && s?.pythonNeedsUpgrade) {
            suggestions.push(`Python ${s.pythonVersion} detected. Upgrade to 3.10+ to avoid template/runtime drift.`);
        }
        if (!s?.coreInstalled && s?.pipxInstalled) {
            suggestions.push('RapidKit Core missing while pipx exists. Best next step: Install Core via pipx.');
        }
        if (!s?.goInstalled && preferences.manualPaths.go) {
            suggestions.push('Go not detected but manual path exists. Run Verify Go; if it still fails, fix executable permission.');
        }
        if (!s?.dotnetInstalled) {
            suggestions.push('.NET SDK missing. Install .NET SDK 8+ for ASP.NET Core services, then run Verify .NET.');
        }
        if (!s?.dotnetInstalled && preferences.manualPaths.dotnet) {
            suggestions.push('.NET not detected but manual path exists. Run Verify .NET; check executable permission or path accuracy.');
        }
        // Java-specific insights
        if (!s?.javaInstalled) {
            suggestions.push('Java (JDK) missing. Install Temurin 21+ via adoptium.net or use SDKMAN: sdk install java 21-tem');
        }
        if (s?.javaInstalled && !s?.mavenInstalled && !s?.gradleInstalled) {
            suggestions.push('Java detected but no build tool found. Install Maven (sdk install maven) or Gradle (sdk install gradle).');
        }
        if (s?.javaInstalled && !s?.mavenInstalled) {
            suggestions.push('Maven missing. Spring Boot projects with pom.xml require mvn on PATH. Run: sdk install maven');
        }
        if (s?.javaInstalled && !s?.gradleInstalled) {
            suggestions.push('Gradle missing. Spring Boot projects with build.gradle require gradle on PATH. Run: sdk install gradle');
        }
        if (s?.javaInstalled && s?.javaVersion) {
            const major = parseInt(s.javaVersion.split('.')[0], 10);
            if (!isNaN(major) && major < 17) {
                suggestions.push(`JDK ${s.javaVersion} detected. Spring Boot 3+ requires JDK 17+. Upgrade: sdk install java 21-tem`);
            }
        }
        if (!s?.javaInstalled && preferences.manualPaths.java) {
            suggestions.push('Java not detected but manual path exists. Run Verify Java; check executable permission or path accuracy.');
        }
        if (pathDoctor?.missingCommonEntries?.length) {
            suggestions.push(`PATH Doctor found ${pathDoctor.missingCommonEntries.length} missing common entries. Apply snippet and reload shell.`);
        }
        if (readinessScore >= 85) {
            suggestions.push('Environment is near production-ready. Export setup report and share baseline with your team.');
        }
        if (suggestions.length === 0) {
            suggestions.push('No critical blockers detected. Keep versions updated and re-check after major SDK upgrades.');
        }

        return suggestions;
    }, [
        status,
        preferences.manualPaths.go,
        preferences.manualPaths.dotnet,
        pathDoctor,
        readinessScore,
        validationResult,
    ]);

    const copilotCommands = useMemo(() => {
        if (validationResult?.suggestedCommands?.length) {
            return validationResult.suggestedCommands;
        }
        if (pathDoctor?.suggestions?.length) {
            return [pathDoctor.suggestions[0].snippet];
        }
        return [];
    }, [pathDoctor, validationResult]);

    const loading = status === null || refreshing;

    const installMethod = useCallback((key: InstallMethodKey) => {
        return preferences.installMethods[key] || 'recommended';
    }, [preferences.installMethods]);

    const setInstallMethod = useCallback((key: InstallMethodKey, method: string) => {
        vscode.postMessage('setInstallMethod', { key, method });
    }, []);

    return (
        <main className={`ws-setup-shell${embedded ? ' ws-setup-shell--embedded' : ''}`}>

            {!embedded ? (
            <header className="spc-topbar">
                <button className="ws-btn" onClick={() => vscode.postMessage('showWelcome')}>
                    <ArrowLeft size={14} />
                    Dashboard
                </button>
                <div className="spc-topbar-actions">
                    <button className="ws-btn" onClick={refresh} disabled={refreshing}>
                        <RefreshCw size={13} className={refreshing ? 'spc-spinning' : ''} />
                        Refresh
                    </button>
                    <button className="ws-btn ws-btn--primary" onClick={() => vscode.postMessage('doctor')}>
                        <Wrench size={13} />
                        Run Doctor
                    </button>
                </div>
            </header>
            ) : (
            <header className="ws-setup-topbar--embedded spc-topbar spc-topbar--embedded">
                <div className="spc-topbar-copy">
                    <div className="ws-kicker">Developer Environment</div>
                    <h2 className="ws-setup-topbar-title">Setup Center</h2>
                </div>
                <div className="spc-topbar-actions">
                    <button className="ws-btn" onClick={refresh} disabled={refreshing}>
                        <RefreshCw size={13} className={refreshing ? 'spc-spinning' : ''} />
                        Refresh
                    </button>
                    <button className="ws-btn ws-btn--primary" onClick={() => vscode.postMessage('doctor')}>
                        <Wrench size={13} />
                        Run Doctor
                    </button>
                </div>
            </header>
            )}

            <div className={`spc-hero${embedded ? ' ws-setup-hero--embedded spc-hero--embedded' : ''}`}>
                <div className="spc-hero-copy">
                    {!embedded ? (
                        <>
                    <div className="ws-kicker">Developer Environment</div>
                    <h1 className="spc-hero-title">Setup Center</h1>
                    <p className="spc-hero-desc">
                        Your runtime toolchain at a glance — Python, Node, Go, and Spring Boot, all in one place.
                    </p>
                        </>
                    ) : (
                    <p className="ws-setup-hero-desc--embedded spc-hero-desc--embedded">
                        Your runtime toolchain at a glance — Python, Node, Go, and Spring Boot, all in one place.
                    </p>
                    )}
                    {allReady && !loading && <AllSetBanner />}
                </div>
                <ProgressRing value={coreReady} max={coreTools.length} />
            </div>

            <section className="spc-smart-grid">
                <article className="ws-card">
                    <div className="spc-panel-head">
                        <Gauge size={14} />
                        <span>Readiness Score</span>
                    </div>
                    <div className="spc-score-value">{readinessScore}%</div>
                    <div className="spc-score-caption">Installed tools coverage</div>
                    {readinessGaps.length > 0 && (
                        <ul className="spc-plain-list">
                            {readinessGaps.map((gap) => (
                                <li key={gap}>{gap}</li>
                            ))}
                        </ul>
                    )}
                </article>

                <article className="ws-card">
                    <button className="spc-panel-toggle" onClick={() => setInsightsOpen((prev) => !prev)}>
                        <span>AI Setup Copilot</span>
                        {insightsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    {insightsOpen && (
                        <div className="spc-copilot-body">
                            <ul className="spc-plain-list">
                                {aiInsights.map((insight) => (
                                    <li key={insight}>{insight}</li>
                                ))}
                            </ul>
                            {validationResult && (
                                <div className={'spc-copilot-status' + (validationResult.ok ? ' ok' : ' warn')}>
                                    <strong>{validationResult.tool}</strong>
                                    <span>{validationResult.ok ? 'Validated successfully' : validationResult.summary}</span>
                                </div>
                            )}
                            {copilotCommands.length > 0 && (
                                <div className="spc-snippet-wrap">
                                    <div className="spc-snippet-head">
                                        <span>Exact command{copilotCommands.length > 1 ? 's' : ''}</span>
                                        <button className="ws-btn" onClick={() => vscode.postMessage('copyText', { text: copilotCommands.join('\n') })}>
                                            <Clipboard size={13} />
                                            Copy
                                        </button>
                                    </div>
                                    <pre className="spc-snippet">{copilotCommands.join('\n')}</pre>
                                </div>
                            )}
                        </div>
                    )}
                </article>
            </section>

            <ToolGroup title="Core Requirements" tools={coreTools} loading={loading} />
            <ToolGroup title="Python Ecosystem" tools={pythonTools} loading={loading} />
            <ToolGroup title="Go" tools={goTools} loading={loading} />
            <ToolGroup title=".NET / ASP.NET Core" tools={dotnetTools} loading={loading} />
            <ToolGroup title="Java / Spring Boot" tools={javaTools} loading={loading} />

            <section className="ws-card">
                <div className="spc-panel-head">
                    <FolderSearch size={14} />
                    <span>Manual Binary Paths</span>
                </div>
                <div className="spc-muted">
                    Priority order: <strong>Manual Path</strong> &gt; <strong>PATH</strong> &gt; <strong>Fallbacks</strong>
                </div>
                <div className="spc-path-grid">
                    {MANUAL_PATH_TOOLS.map((tool) => {
                        const value = manualDrafts[tool.key] ?? preferences.manualPaths[tool.key] ?? '';
                        const detection = status?.detections?.[tool.key];
                        return (
                            <div className="spc-path-row" key={tool.key}>
                                <label className="spc-path-label">
                                    <span>{tool.label}</span>
                                    {detectionLabel(detection?.source) && (
                                        <span className="ws-chip ws-chip--muted">{detectionLabel(detection?.source)}</span>
                                    )}
                                </label>
                                <input
                                    className="spc-input"
                                    value={value}
                                    placeholder={tool.placeholder}
                                    onChange={(event) => setManualDraft(tool.key, event.target.value)}
                                />
                                <div className="spc-path-actions">
                                    <button className="ws-btn" onClick={() => vscode.postMessage('pickManualPath', { tool: tool.key })}>Browse</button>
                                    <button className="ws-btn" onClick={() => saveManualPath(tool.key)}>Save</button>
                                    <button className="ws-btn" onClick={() => validateManualPath(tool.key)}>Validate</button>
                                    <button className="ws-btn" onClick={() => clearManualPath(tool.key)}>Clear</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {validationResult && (
                    <div className={'spc-validation-box' + (validationResult.ok ? ' ok' : ' warn')}>
                        <div className="spc-validation-head">
                            <span>Latest validation</span>
                            {validationResult.command && <code>{validationResult.command}</code>}
                        </div>
                        <div className="spc-hint">{validationResult.summary}</div>
                        {validationResult.output && <pre className="spc-snippet">{validationResult.output}</pre>}
                    </div>
                )}
            </section>

            <section className="ws-card">
                <div className="spc-panel-head">
                    <span>Install Strategy</span>
                </div>
                <div className="spc-strategy-grid">
                    {([
                        ['python', 'Python'],
                        ['core', 'RapidKit Core'],
                        ['cli', 'RapidKit CLI'],
                        ['go', 'Go'],
                        ['dotnet', '.NET'],
                        ['java', 'Java'],
                    ] as Array<[InstallMethodKey, string]>).map(([key, label]) => (
                        <label key={key} className="spc-strategy-row">
                            <span>{label}</span>
                            <select
                                className="spc-select"
                                value={installMethod(key)}
                                onChange={(event) => setInstallMethod(key, event.target.value)}
                            >
                                {INSTALL_METHOD_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                    ))}
                </div>
            </section>

            <section className="ws-card">
                <div className="spc-panel-head">
                    <Wrench size={14} />
                    <span>PATH Doctor</span>
                </div>
                <div className="spc-pathdoctor-meta">
                    <span>Shell: {pathDoctor?.shellName || pathDoctor?.shell || 'unknown'}</span>
                    {pathDoctor?.targetFile && <span>Profile: {pathDoctor.targetFile}</span>}
                    <button className="ws-btn" onClick={() => vscode.postMessage('runPathDoctor')}>Run PATH Doctor</button>
                </div>
                {pathDoctor?.missingCommonEntries?.length ? (
                    <ul className="spc-plain-list">
                        {pathDoctor.missingCommonEntries.map((entry) => <li key={entry}>{entry}</li>)}
                    </ul>
                ) : (
                    <div className="spc-muted">No common PATH gaps detected.</div>
                )}
                {pathDoctor?.suggestions?.map((suggestion) => (
                    <div key={suggestion.title} className="spc-snippet-wrap">
                        <div className="spc-snippet-head">
                            <span>{suggestion.title}</span>
                            <div className="spc-inline-actions">
                                {suggestion.targetFile && (
                                    <button className="ws-btn" onClick={() => vscode.postMessage('applyPathDoctorSuggestion', { suggestionId: suggestion.id })}>
                                        Apply Snippet
                                    </button>
                                )}
                                <button className="ws-btn" onClick={() => vscode.postMessage('copyText', { text: suggestion.snippet })}>
                                    <Clipboard size={13} />
                                    Copy
                                </button>
                            </div>
                        </div>
                        {suggestion.reason && <div className="spc-hint">{suggestion.reason}</div>}
                        <pre className="spc-snippet">{suggestion.snippet}</pre>
                    </div>
                ))}
            </section>

            <section className="spc-advanced">
                <button className="spc-advanced-toggle" onClick={() => setAdvancedOpen(v => !v)}>
                    {advancedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    Advanced Actions
                </button>
                {advancedOpen && (
                    <div className="spc-advanced-body">
                        <button className="ws-btn" onClick={() => vscode.postMessage('installPipCore')}>Install Core via pipx</button>
                        <button className="ws-btn" onClick={() => vscode.postMessage('upgradePipCore')}>Upgrade Core</button>
                        <button className="ws-btn" onClick={() => vscode.postMessage('installPipxThenCore')}>Install pipx then Core</button>
                        <button className="ws-btn" onClick={() => vscode.postMessage('installCoreFallback')}>Core fallback (pip)</button>
                        <button className="ws-btn" onClick={() => vscode.postMessage('upgradeNpmGlobal')}>Upgrade CLI</button>
                        <button className="ws-btn" onClick={() => vscode.postMessage('clearRequirementCache')}>Clear Cache</button>
                        <button className="ws-btn" onClick={() => vscode.postMessage('exportSetupReport')}>
                            <Save size={13} />
                            Export Report
                        </button>
                    </div>
                )}
            </section>

        </main>
    );
}
