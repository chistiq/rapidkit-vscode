import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FolderPlus, Sparkles } from 'lucide-react';
import type { WorkspaceToolStatus } from '@/types';
import { vscode } from '@/vscode';
import {
  MANUAL_STACK_LANES,
  defaultProfileForStackLane,
  profileRequiresPythonInstallMethod,
  recommendedProfilesForStackLane,
  resolveDefaultWorkspaceName,
  stackLaneGuidance,
  type CreationStackLane,
} from '@/lib/creationPresets';
import { EnterpriseModal, EnterpriseModalNotice } from './EnterpriseModal';

export type WorkspaceProfile =
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
    | 'dotnet-only'
    | 'polyglot'
    | 'enterprise';
export type WorkspaceInstallMethod = 'auto' | 'poetry' | 'venv' | 'pipx';

export interface WorkspaceCreationConfig {
    name: string;
    profile: WorkspaceProfile;
    installMethod: WorkspaceInstallMethod;
    initGit: boolean;
    policyMode: 'warn' | 'strict';
    dependencySharing: 'isolated' | 'shared';
}

interface CreateWorkspaceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (config: WorkspaceCreationConfig) => void;
    onSwitchToAI?: () => void;
    toolStatus?: WorkspaceToolStatus | null;
}

const PROFILES: { value: WorkspaceProfile; icon: string; iconUri?: string; label: string; desc: string }[] = [
    { value: 'minimal', icon: '⚡', label: 'Minimal', desc: 'Workspace foundation' },
    { value: 'python-only', icon: 'Py', label: 'Python runtime', desc: 'FastAPI, data, automation' },
    { value: 'node-only', icon: 'JS', label: 'Node.js runtime', desc: 'Frontend, NestJS, tooling' },
    { value: 'go-only', icon: 'Go', label: 'Go runtime', desc: 'Go services and CLIs' },
    { value: 'java-only', icon: 'Java', iconUri: (typeof window !== 'undefined' ? (window as any).SPRINGBOOT_ICON_URI : undefined), label: 'Java runtime', desc: 'Spring Boot services' },
    { value: 'dotnet-only', icon: '.NET', label: '.NET runtime', desc: 'ASP.NET Core services' },
    { value: 'polyglot', icon: 'All', label: 'Polyglot', desc: 'Multi-runtime workspace' },
    { value: 'enterprise', icon: 'Gov', label: 'Enterprise', desc: 'Governance-ready workspace' },
];

const INSTALL_METHODS: { value: WorkspaceInstallMethod; label: string; desc: string }[] = [
    { value: 'auto', label: 'Auto-detect', desc: 'Poetry if installed, else venv' },
    { value: 'poetry', label: 'Poetry', desc: 'Force Poetry' },
    { value: 'venv', label: 'venv', desc: 'Pure Python venv + pip' },
    { value: 'pipx', label: 'pipx', desc: 'Isolated pipx environments' },
];

export function CreateWorkspaceModal({ isOpen, onClose, onCreate, onSwitchToAI, toolStatus }: CreateWorkspaceModalProps) {
    const [workspaceName, setWorkspaceName] = useState('');
    const [nameTouched, setNameTouched] = useState(false);
    const [error, setError] = useState('');
    const [stackLane, setStackLane] = useState<CreationStackLane>('balanced');
    const [profile, setProfile] = useState<WorkspaceProfile>('minimal');
    const [installMethod, setInstallMethod] = useState<WorkspaceInstallMethod>('auto');
    const [initGit, setInitGit] = useState(true);
    const [strictPolicy, setStrictPolicy] = useState(false);
    const [depSharing, setDepSharing] = useState(false);

    const suggestedWorkspaceName = useMemo(
        () => resolveDefaultWorkspaceName(stackLane, profile),
        [stackLane, profile]
    );

    const recommendedProfiles = useMemo(
        () => recommendedProfilesForStackLane(stackLane),
        [stackLane]
    );

    const orderedProfiles = useMemo(() => {
        if (!recommendedProfiles) {
            return PROFILES;
        }
        const recommended = new Set(recommendedProfiles);
        return [
            ...PROFILES.filter((item) => recommended.has(item.value)),
            ...PROFILES.filter((item) => !recommended.has(item.value)),
        ];
    }, [recommendedProfiles]);

    const handleStackLaneChange = (lane: CreationStackLane) => {
        setStackLane(lane);
        setProfile(defaultProfileForStackLane(lane));
    };

    useEffect(() => {
        if (isOpen) {
            const initialName = resolveDefaultWorkspaceName('balanced', 'minimal');
            setWorkspaceName(initialName);
            setNameTouched(false);
            setError('');
            setStackLane('balanced');
            setProfile('minimal');
            setInstallMethod(toolStatus?.preferredInstallMethod ?? 'auto');
            setInitGit(true);
            setStrictPolicy(false);
            setDepSharing(false);
            validateName(initialName);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen, toolStatus?.preferredInstallMethod]);

    useEffect(() => {
        if (!isOpen || nameTouched) {
            return;
        }
        setWorkspaceName(suggestedWorkspaceName);
        validateName(suggestedWorkspaceName);
    }, [isOpen, nameTouched, suggestedWorkspaceName]);

    const isInstallMethodEnabled = (method: WorkspaceInstallMethod): boolean => {
        if (!toolStatus || method === 'auto') {
            return true;
        }
        if (method === 'poetry') {
            return toolStatus.poetryAvailable;
        }
        if (method === 'venv') {
            return toolStatus.venvAvailable;
        }
        if (method === 'pipx') {
            return toolStatus.pipxAvailable;
        }
        return true;
    };

    const getInstallMethodDisabledReason = (method: WorkspaceInstallMethod): string | null => {
        if (!toolStatus || isInstallMethodEnabled(method)) {
            return null;
        }
        if (method === 'poetry') {
            return 'Poetry is not detected';
        }
        if (method === 'pipx') {
            return 'pipx is not detected';
        }
        if (method === 'venv') {
            return 'Python venv support is not available';
        }
        return null;
    };

    const validateName = (name: string): boolean => {
        if (!name.trim()) {
            setError('Workspace name is required');
            return false;
        }
        if (name.length < 2) {
            setError('Name must be at least 2 characters');
            return false;
        }
        if (name.length > 50) {
            setError('Name must be less than 50 characters');
            return false;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            setError('Only letters, numbers, hyphens, and underscores allowed');
            return false;
        }
        setError('');
        return true;
    };

    const handleCreate = () => {
        if (!validateName(workspaceName)) {
            return;
        }
        onCreate({
            name: workspaceName,
            profile,
            installMethod,
            initGit,
            policyMode: strictPolicy ? 'strict' : 'warn',
            dependencySharing: depSharing ? 'shared' : 'isolated',
        });
        onClose();
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            handleCreate();
        }
    };

    const needsJava = profile === 'java-only' || profile === 'polyglot' || profile === 'enterprise';
    const needsDotnet =
        profile === 'dotnet-only' || profile === 'polyglot' || profile === 'enterprise';
    const showInstallMethod = profileRequiresPythonInstallMethod(profile);
    const canCreate = workspaceName.trim() && !error;

    return (
        <EnterpriseModal
            isOpen={isOpen}
            title="Create Workspace"
            subtitle="Choose your stack focus, bootstrap profile, and governance posture."
            kicker="Workspace operation"
            icon={<FolderPlus size={16} />}
            size="lg"
            onClose={onClose}
            footer={
                <>
                    {onSwitchToAI && (
                        <button type="button" className="ws-btn ws-btn--ghost" onClick={onSwitchToAI}>
                            <Sparkles size={13} />
                            Use AI instead
                        </button>
                    )}
                    <div className="enterprise-modal-actions">
                        <button type="button" className="ws-btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="ws-btn ws-btn--primary"
                            onClick={handleCreate}
                            disabled={!canCreate}
                        >
                            Create Workspace
                        </button>
                    </div>
                </>
            }
        >
            <div className="modal-form-grid">
                <div className="modal-field modal-field--wide">
                    <span>Stack focus</span>
                    <div className="ai-create-stack-lane-grid">
                        {MANUAL_STACK_LANES.map((lane) => (
                            <button
                                key={lane.id}
                                type="button"
                                className={`modal-option-card ai-create-stack-lane ${stackLane === lane.id ? 'modal-option-card--active' : ''}`}
                                onClick={() => handleStackLaneChange(lane.id)}
                            >
                                <span className="modal-option-card__title">{lane.label}</span>
                                <span className="modal-option-card__desc">{lane.detail}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <EnterpriseModalNotice tone="info">
                    {stackLaneGuidance(stackLane)}
                </EnterpriseModalNotice>

                <label className="modal-field modal-field--wide">
                    <span>Workspace name</span>
                    <input
                        type="text"
                        value={workspaceName}
                        onChange={(event) => {
                            setNameTouched(true);
                            setWorkspaceName(event.target.value);
                            validateName(event.target.value);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={suggestedWorkspaceName}
                        autoFocus
                        spellCheck={false}
                    />
                    {error ? (
                        <span className="modal-field__error">
                            <AlertCircle size={12} />
                            {error}
                        </span>
                    ) : workspaceName ? (
                        <span className="modal-field__hint">~/rapidkit/workspaces/{workspaceName}</span>
                    ) : null}
                </label>

                <div className="modal-field modal-field--wide">
                    <span>
                        Bootstrap profile
                        {recommendedProfiles ? (
                            <button
                                type="button"
                                className="ws-btn ws-btn--ghost ai-create-profile-hint"
                                onClick={() => setProfile(defaultProfileForStackLane(stackLane))}
                            >
                                Use recommended
                            </button>
                        ) : null}
                    </span>
                    <div className="modal-option-grid modal-option-grid--profiles">
                        {orderedProfiles.map((item) => {
                            const isRecommended = recommendedProfiles?.includes(item.value) ?? false;
                            return (
                            <button
                                key={item.value}
                                type="button"
                                className={`modal-option-card ${profile === item.value ? 'modal-option-card--active' : ''} ${isRecommended ? 'modal-option-card--recommended' : ''}`}
                                onClick={() => setProfile(item.value)}
                            >
                                <span className="modal-option-card__icon">
                                    {item.iconUri ? <img src={item.iconUri} alt={item.label} /> : item.icon}
                                </span>
                                <strong>{item.label}</strong>
                                <small>{item.desc}</small>
                                {isRecommended ? <em className="modal-option-card__badge">Recommended</em> : null}
                            </button>
                            );
                        })}
                    </div>
                </div>

                {needsJava && toolStatus && !toolStatus.javaAvailable && (
                    <div className="modal-field--wide">
                        <EnterpriseModalNotice tone="warning">
                            <AlertCircle size={14} />
                            <span>Java JDK 17+ is required for this profile.</span>
                            <button type="button" className="modal-inline-link" onClick={() => vscode.postMessage('openSetup')}>
                                Open Setup
                            </button>
                        </EnterpriseModalNotice>
                    </div>
                )}

                {needsDotnet && toolStatus && !toolStatus.dotnetAvailable && (
                    <div className="modal-field--wide">
                        <EnterpriseModalNotice tone="warning">
                            <AlertCircle size={14} />
                            <span>.NET SDK 8+ is required for this profile.</span>
                            <button type="button" className="modal-inline-link" onClick={() => vscode.postMessage('openSetup')}>
                                Open Setup
                            </button>
                        </EnterpriseModalNotice>
                    </div>
                )}

                {showInstallMethod ? (
                    <div className="modal-field modal-field--wide">
                        <span>Install method</span>
                        <div className="modal-option-grid modal-option-grid--two">
                            {INSTALL_METHODS.map((item) => {
                                const enabled = isInstallMethodEnabled(item.value);
                                const reason = getInstallMethodDisabledReason(item.value);
                                return (
                                    <button
                                        key={item.value}
                                        type="button"
                                        className={`modal-option-row ${installMethod === item.value ? 'modal-option-row--active' : ''}`}
                                        onClick={() => enabled && setInstallMethod(item.value)}
                                        disabled={!enabled}
                                        title={reason ?? item.desc}
                                    >
                                        <span className="modal-radio-dot" />
                                        <span>
                                            <strong>{item.label}</strong>
                                            <small>{reason ?? item.desc}</small>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {toolStatus && (
                            <span className="modal-field__hint">
                                Active: {toolStatus.preferredInstallMethod} · Java {toolStatus.javaAvailable ? 'ok' : 'missing'} · Maven {toolStatus.mavenAvailable ? 'ok' : 'missing'} · Gradle {toolStatus.gradleAvailable ? 'ok' : 'missing'} · .NET {toolStatus.dotnetAvailable ? 'ok' : 'missing'}
                            </span>
                        )}
                    </div>
                ) : null}

                <div className="modal-field modal-field--wide">
                    <span>Options</span>
                    <div className="modal-check-list">
                        {[
                            { checked: initGit, toggle: () => setInitGit((value) => !value), label: 'Initialize Git repository', desc: 'Run git init and create an initial commit' },
                            { checked: strictPolicy, toggle: () => setStrictPolicy((value) => !value), label: 'Strict policy enforcement', desc: 'Fail CI on any violation' },
                            { checked: depSharing, toggle: () => setDepSharing((value) => !value), label: 'Enable dependency sharing', desc: 'Share packages across projects' },
                        ].map((item) => (
                            <button
                                key={item.label}
                                type="button"
                                className={`modal-check-row ${item.checked ? 'modal-check-row--active' : ''}`}
                                onClick={item.toggle}
                            >
                                <span className="modal-check-box">{item.checked ? '✓' : ''}</span>
                                <span>
                                    <strong>{item.label}</strong>
                                    <small>{item.desc}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </EnterpriseModal>
    );
}
