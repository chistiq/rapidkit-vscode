import { useEffect, useState } from 'react';
import { AlertCircle, FolderPlus, Sparkles } from 'lucide-react';
import type { WorkspaceToolStatus } from '@/types';
import { vscode } from '@/vscode';
import { EnterpriseModal, EnterpriseModalNotice } from './EnterpriseModal';

export type WorkspaceProfile =
    | 'minimal'
    | 'python-only'
    | 'node-only'
    | 'go-only'
    | 'java-only'
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
    { value: 'minimal', icon: '⚡', label: 'Minimal', desc: 'Files only' },
    { value: 'python-only', icon: 'Py', label: 'Python', desc: 'Poetry/venv' },
    { value: 'node-only', icon: 'JS', label: 'Node.js', desc: 'npm/NestJS' },
    { value: 'go-only', icon: 'Go', label: 'Go', desc: 'Go runtime' },
    { value: 'java-only', icon: 'Java', iconUri: (typeof window !== 'undefined' ? (window as any).SPRINGBOOT_ICON_URI : undefined), label: 'Java', desc: 'Spring Boot' },
    { value: 'polyglot', icon: 'All', label: 'Polyglot', desc: 'Py+Node+Go+Java' },
    { value: 'enterprise', icon: 'Gov', label: 'Enterprise', desc: '+Governance' },
];

const INSTALL_METHODS: { value: WorkspaceInstallMethod; label: string; desc: string }[] = [
    { value: 'auto', label: 'Auto-detect', desc: 'Poetry if installed, else venv' },
    { value: 'poetry', label: 'Poetry', desc: 'Force Poetry' },
    { value: 'venv', label: 'venv', desc: 'Pure Python venv + pip' },
    { value: 'pipx', label: 'pipx', desc: 'Isolated pipx environments' },
];

export function CreateWorkspaceModal({ isOpen, onClose, onCreate, onSwitchToAI, toolStatus }: CreateWorkspaceModalProps) {
    const [workspaceName, setWorkspaceName] = useState('');
    const [error, setError] = useState('');
    const [profile, setProfile] = useState<WorkspaceProfile>('minimal');
    const [installMethod, setInstallMethod] = useState<WorkspaceInstallMethod>('auto');
    const [initGit, setInitGit] = useState(true);
    const [strictPolicy, setStrictPolicy] = useState(false);
    const [depSharing, setDepSharing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setWorkspaceName('');
            setError('');
            setProfile('minimal');
            setInstallMethod(toolStatus?.preferredInstallMethod ?? 'auto');
            setInitGit(true);
            setStrictPolicy(false);
            setDepSharing(false);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen, toolStatus?.preferredInstallMethod]);

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
    const canCreate = workspaceName.trim() && !error;

    return (
        <EnterpriseModal
            isOpen={isOpen}
            title="Create Workspace"
            subtitle="Choose a governed workspace profile, runtime strategy, and policy posture."
            kicker="Workspace operation"
            icon={<FolderPlus size={16} />}
            size="lg"
            onClose={onClose}
            footer={
                <>
                    {onSwitchToAI && (
                        <button type="button" className="enterprise-button enterprise-button--ghost" onClick={onSwitchToAI}>
                            <Sparkles size={13} />
                            Use AI instead
                        </button>
                    )}
                    <div className="enterprise-modal-actions">
                        <button type="button" className="enterprise-button enterprise-button--secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="enterprise-button enterprise-button--primary"
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
                <label className="modal-field modal-field--wide">
                    <span>Workspace name</span>
                    <input
                        type="text"
                        value={workspaceName}
                        onChange={(event) => {
                            setWorkspaceName(event.target.value);
                            validateName(event.target.value);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="my-awesome-workspace"
                        autoFocus
                        spellCheck={false}
                    />
                    {error ? (
                        <span className="modal-field__error">
                            <AlertCircle size={12} />
                            {error}
                        </span>
                    ) : workspaceName ? (
                        <span className="modal-field__hint">~/Workspai/rapidkits/{workspaceName}</span>
                    ) : null}
                </label>

                <div className="modal-field modal-field--wide">
                    <span>Bootstrap profile</span>
                    <div className="modal-option-grid modal-option-grid--profiles">
                        {PROFILES.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className={`modal-option-card ${profile === item.value ? 'modal-option-card--active' : ''}`}
                                onClick={() => setProfile(item.value)}
                            >
                                <span className="modal-option-card__icon">
                                    {item.iconUri ? <img src={item.iconUri} alt={item.label} /> : item.icon}
                                </span>
                                <strong>{item.label}</strong>
                                <small>{item.desc}</small>
                            </button>
                        ))}
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
                            Active: {toolStatus.preferredInstallMethod} · Java {toolStatus.javaAvailable ? 'ok' : 'missing'} · Maven {toolStatus.mavenAvailable ? 'ok' : 'missing'} · Gradle {toolStatus.gradleAvailable ? 'ok' : 'missing'}
                        </span>
                    )}
                </div>

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
