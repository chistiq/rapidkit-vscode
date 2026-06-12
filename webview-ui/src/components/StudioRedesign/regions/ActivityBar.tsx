/**
 * ActivityBar: Tool launcher strip — quick-access to governed Studio actions.
 * NOT a phase navigator — PhaseStepper handles phases.
 */

import React from 'react';
import { Terminal, ScanLine, Lightbulb, Code, ShieldCheck, LucideIcon } from 'lucide-react';
import { studioClass } from '../styles/studioUi';
import { STUDIO_ACTION_COMMANDS, StudioActionCommand } from '../state/studioActions';

interface Tool {
    id: string;
    icon: LucideIcon;
    label: string;
    shortcut: string;
    command: StudioActionCommand;
}

const TOOLS: Tool[] = [
    { id: 'terminal', icon: Terminal, label: 'Terminal Bridge', shortcut: '⌘T', command: STUDIO_ACTION_COMMANDS.terminalBridge },
    { id: 'scan', icon: ScanLine, label: 'Run Analyze', shortcut: '⌘S', command: STUDIO_ACTION_COMMANDS.runAnalyze },
    { id: 'impact', icon: Lightbulb, label: 'Impact Lens', shortcut: '⌘I', command: STUDIO_ACTION_COMMANDS.impactLens },
    { id: 'fix', icon: Code, label: 'Fix Lens', shortcut: '⌘F', command: STUDIO_ACTION_COMMANDS.fixLens },
    { id: 'verify', icon: ShieldCheck, label: 'Verify Gates', shortcut: '⌘V', command: STUDIO_ACTION_COMMANDS.verifyGates },
];

interface ActivityBarProps {
    activeTool?: string;
    onToolSelect?: (toolId: string) => void;
    onExecuteAction?: (command: StudioActionCommand) => void;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
    activeTool,
    onToolSelect,
    onExecuteAction,
}) => {
    return (
        <nav aria-label="Studio tools" className={`${studioClass.rail} ${studioClass.activityBar}`}>
            <div className="studio-activity-bar__group">
                {TOOLS.slice(0, 3).map((tool) => (
                    <ToolButton
                        key={tool.id}
                        tool={tool}
                        isActive={activeTool === tool.id}
                        onSelect={onToolSelect}
                        onExecute={onExecuteAction}
                    />
                ))}
            </div>

            <div className="studio-activity-bar__group">
                {TOOLS.slice(3).map((tool) => (
                    <ToolButton
                        key={tool.id}
                        tool={tool}
                        isActive={activeTool === tool.id}
                        onSelect={onToolSelect}
                        onExecute={onExecuteAction}
                    />
                ))}
            </div>
        </nav>
    );
};

interface ToolButtonProps {
    tool: Tool;
    isActive: boolean;
    onSelect?: (id: string) => void;
    onExecute?: (command: StudioActionCommand) => void;
}

const ToolButton: React.FC<ToolButtonProps> = ({ tool, isActive, onSelect, onExecute }) => {
    const Icon = tool.icon;
    return (
        <button
            type="button"
            aria-label={tool.label + (tool.shortcut ? ` (${tool.shortcut})` : '')}
            aria-pressed={isActive}
            title={tool.label + (tool.shortcut ? `  ${tool.shortcut}` : '')}
            onClick={() => {
                onSelect?.(tool.id);
                onExecute?.(tool.command);
            }}
            className={`studio-tool-btn${isActive ? ' is-active' : ''}`}
        >
            <Icon size={16} />
            {isActive ? <span className="studio-tool-btn__indicator" aria-hidden="true" /> : null}
        </button>
    );
};
