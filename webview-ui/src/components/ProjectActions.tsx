import {
    BrainCircuit,
    GitBranch,
    Hammer,
    Layers,
    Package,
    Play,
    ShieldCheck,
    Square,
    Stethoscope,
    Terminal,
    TestTube,
    Globe
} from 'lucide-react';
import type { WorkspaceStatus } from '@/types';

interface ProjectActionsProps {
    workspaceStatus: WorkspaceStatus;
    onTerminal: () => void;
    onInit: () => void;
    onDev: () => void;
    onStop: () => void;
    onTest: () => void;
    onDoctor: () => void;
    onArchitecture: () => void;
    onIncident: () => void;
    onAI: () => void;
    onRelease: () => void;
    onImpact: () => void;
    onBrowser: () => void;
    onBuild: () => void;
}

export function ProjectActions({
    workspaceStatus,
    onTerminal,
    onInit,
    onDev,
    onStop,
    onTest,
    onDoctor,
    onArchitecture,
    onIncident,
    onAI,
    onRelease,
    onImpact,
    onBrowser,
    onBuild
}: ProjectActionsProps) {
    if (!workspaceStatus.hasWorkspace) {
        return null;
    }

    const isRunning = workspaceStatus.isRunning || false;
    const projectScope = workspaceStatus.projectName || workspaceStatus.projectType || 'Selected project';

    return (
        <div className="project-actions-section">
            <div className="project-actions-header">
                <Package className="w-4 h-4" />
                <span>Project Actions</span>
                <span className="project-actions-name">{projectScope}</span>
            </div>
            <div className="project-actions-grid">
                <button
                    className="project-action-btn"
                    onClick={onTerminal}
                    title="Open Terminal"
                >
                    <Terminal size={18} />
                    <span>Terminal</span>
                </button>
                <button
                    className="project-action-btn"
                    onClick={onInit}
                    title="Install Dependencies"
                >
                    <Package size={18} />
                    <span>Init</span>
                </button>
                {!isRunning ? (
                    <button
                        className="project-action-btn project-action-btn--primary"
                        onClick={onDev}
                        title="Start Dev Server"
                    >
                        <Play size={18} />
                        <span>Dev</span>
                    </button>
                ) : (
                    <button
                        className="project-action-btn project-action-btn--danger"
                        onClick={onStop}
                        title="Stop Server"
                    >
                        <Square size={18} />
                        <span>Stop</span>
                    </button>
                )}
                <button
                    className="project-action-btn"
                    onClick={onTest}
                    title="Run Tests"
                >
                    <TestTube size={18} />
                    <span>Test</span>
                </button>
                <button
                    className="project-action-btn"
                    onClick={onDoctor}
                    title="Check Project Health"
                >
                    <Stethoscope size={18} />
                    <span>Doctor</span>
                </button>
                <button
                    className="project-action-btn"
                    onClick={onArchitecture}
                    title="Open Architecture Map"
                >
                    <GitBranch size={18} />
                    <span>Map</span>
                </button>
                <button
                    className="project-action-btn"
                    onClick={onIncident}
                    title="Analyze in Incident Studio"
                >
                    <BrainCircuit size={18} />
                    <span>Incident</span>
                </button>
                <button
                    className="project-action-btn"
                    onClick={onAI}
                    title="AI Assistant for this project"
                >
                    <BrainCircuit size={18} />
                    <span>AI</span>
                </button>
                <button
                    className="project-action-btn"
                    onClick={onImpact}
                    title="Assess Change Impact"
                >
                    <Layers size={18} />
                    <span>Impact</span>
                </button>
                <button
                    className="project-action-btn"
                    onClick={onRelease}
                    title="Release Readiness Commander"
                >
                    <ShieldCheck size={18} />
                    <span>Release</span>
                </button>
                <button
                    className="project-action-btn"
                    onClick={onBrowser}
                    title={isRunning ? `Open in Browser (port ${workspaceStatus.runningPort || 8000})` : "Start server first"}
                    disabled={!isRunning}
                >
                    <Globe size={18} />
                    <span>Browser</span>
                </button>
                <button
                    className="project-action-btn project-action-btn--build"
                    onClick={onBuild}
                    title="Build Project"
                >
                    <Hammer size={18} />
                    <span>Build</span>
                </button>
            </div>
        </div>
    );
}
