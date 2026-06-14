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
    Globe,
    ScanLine,
    Wand2,
} from 'lucide-react';
import type { WorkspaceStatus } from '@/types';
import { ActionTile, ActionTileGrid } from './ActionTile';
import { ColumnHeader } from './SectionHeader';

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
    onLint?: () => void;
    onFormat?: () => void;
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
    onBuild,
    onLint,
    onFormat,
}: ProjectActionsProps) {
    if (!workspaceStatus.hasWorkspace) {
        return null;
    }

    const isRunning = workspaceStatus.isRunning || false;
    const projectScope = workspaceStatus.projectName || workspaceStatus.projectType || 'Selected project';

    return (
        <div className="workspai-action-panel">
            <ColumnHeader title="Project actions" subtitle={projectScope} scope="project" />
            <ActionTileGrid layout="project">
                <ActionTile icon={<Terminal size={15} />} label="Terminal" detail="Shell access" onClick={onTerminal} title="Open Terminal" />
                <ActionTile icon={<Package size={15} />} label="Init" detail="Install deps" onClick={onInit} title="Install Dependencies" />
                {isRunning ? (
                    <ActionTile
                        icon={<Square size={15} />}
                        label="Stop"
                        detail="Stop dev server"
                        variant="danger"
                        onClick={onStop}
                        title="Stop Server"
                    />
                ) : (
                    <ActionTile
                        icon={<Play size={15} />}
                        label="Dev"
                        detail="Start server"
                        variant="primary"
                        onClick={onDev}
                        title="Start Dev Server"
                    />
                )}
                <ActionTile icon={<TestTube size={15} />} label="Test" detail="Run tests" onClick={onTest} title="Run Tests" />
                {onLint ? (
                    <ActionTile icon={<ScanLine size={15} />} label="Lint" detail="Static checks" onClick={onLint} title="Run Lint" />
                ) : null}
                {onFormat ? (
                    <ActionTile icon={<Wand2 size={15} />} label="Format" detail="Code style" onClick={onFormat} title="Run Format" />
                ) : null}
                <ActionTile icon={<Stethoscope size={15} />} label="Doctor" detail="Health scan" onClick={onDoctor} title="Check Project Health" />
                <ActionTile icon={<Hammer size={15} />} label="Build" detail="Compile project" variant="warn" onClick={onBuild} title="Build Project" />
                <ActionTile icon={<GitBranch size={15} />} label="Map" detail="Architecture" onClick={onArchitecture} title="Open Architecture Map" />
                <ActionTile icon={<BrainCircuit size={15} />} label="Incident" detail="Studio analyze" onClick={onIncident} title="Analyze in Incident Studio" />
                <ActionTile icon={<BrainCircuit size={15} />} label="AI" detail="Ask assistant" onClick={onAI} title="AI Assistant for this project" />
                <ActionTile icon={<Layers size={15} />} label="Impact" detail="Change blast" onClick={onImpact} title="Assess Change Impact" />
                <ActionTile icon={<ShieldCheck size={15} />} label="Release" detail="Readiness gate" onClick={onRelease} title="Release Readiness Commander" />
                <ActionTile
                    icon={<Globe size={15} />}
                    label="Browser"
                    detail={isRunning ? `Port ${workspaceStatus.runningPort || 8000}` : 'Start dev first'}
                    onClick={onBrowser}
                    disabled={!isRunning}
                    title={isRunning ? `Open in Browser (port ${workspaceStatus.runningPort || 8000})` : 'Start server first'}
                />
            </ActionTileGrid>
        </div>
    );
}
