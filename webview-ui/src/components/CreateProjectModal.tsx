import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Package, Sparkles } from 'lucide-react';
import { vscode } from '@/vscode';
import type { Kit, WorkspaceToolStatus } from '@/types';
import { EnterpriseModal, EnterpriseModalNotice, EnterpriseModalSection } from './EnterpriseModal';

type ProjectFramework = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';

interface CreateProjectModalProps {
    isOpen: boolean;
    framework: ProjectFramework;
    availableKits: Kit[];
    onClose: () => void;
    onCreate: (name: string, framework: ProjectFramework, kitName: string) => void;
    onSwitchToAI?: () => void;
    toolStatus?: WorkspaceToolStatus | null;
}

const FRAMEWORK_INFO: Record<ProjectFramework, {
    iconUrl?: string;
    title: string;
    subtitle: string;
    description: string;
    placeholder: string;
}> = {
    fastapi: {
        iconUrl: (typeof window !== 'undefined' ? (window as any).FASTAPI_ICON_URI : undefined),
        title: 'FastAPI Project',
        subtitle: 'Python API service',
        description: 'Create a production-oriented Python service inside the selected workspace.',
        placeholder: 'my-fastapi-api',
    },
    nestjs: {
        iconUrl: (typeof window !== 'undefined' ? (window as any).NESTJS_ICON_URI : undefined),
        title: 'NestJS Project',
        subtitle: 'TypeScript service',
        description: 'Create a NestJS service with the selected kit, modules, and workspace metadata.',
        placeholder: 'my-nestjs-app',
    },
    go: {
        iconUrl: (typeof window !== 'undefined' ? (window as any).GO_ICON_URI : undefined),
        title: 'Go Project',
        subtitle: 'Go service',
        description: 'Create a high-performance Go service inside the current workspace.',
        placeholder: 'my-go-service',
    },
    springboot: {
        iconUrl: (typeof window !== 'undefined' ? (window as any).SPRINGBOOT_ICON_URI : undefined),
        title: 'Spring Boot Project',
        subtitle: 'Java service',
        description: 'Create a Java service with Spring Boot conventions and workspace governance.',
        placeholder: 'my-spring-service',
    },
    dotnet: {
        iconUrl: (typeof window !== 'undefined' ? (window as any).DOTNET_ICON_URI : undefined),
        title: '.NET Web API Project',
        subtitle: 'C# service',
        description: 'Create a clean architecture .NET Web API inside the selected workspace.',
        placeholder: 'dotnet-api',
    },
};

export function CreateProjectModal({ isOpen, framework, availableKits, onClose, onCreate, onSwitchToAI, toolStatus }: CreateProjectModalProps) {
    const [projectName, setProjectName] = useState('');
    const [selectedKit, setSelectedKit] = useState('');
    const [error, setError] = useState('');
    const [aiSuggestions, setAiSuggestions] = useState<{ slug: string; reason: string }[]>([]);
    const [aiSuggestLoading, setAiSuggestLoading] = useState(false);
    const [aiSuggestError, setAiSuggestError] = useState('');
    const suggestListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
    const suggestTimeoutRef = useRef<number | null>(null);

    const frameworkKits = availableKits.filter((kit) => kit.category === framework);
    const selectedKitData = frameworkKits.find((kit) => kit.name === selectedKit);
    const info = FRAMEWORK_INFO[framework];
    const supportsModuleSuggestions = framework === 'fastapi' || framework === 'nestjs';
    const canCreate = projectName.trim() && !error && selectedKit;

    useEffect(() => {
        if (isOpen) {
            setProjectName('');
            setError('');
            setAiSuggestions([]);
            setAiSuggestError('');
            setAiSuggestLoading(false);
            const kits = availableKits.filter((kit) => kit.category === framework);
            setSelectedKit(kits.length > 0 ? kits[0].name : '');
        }
    }, [isOpen, framework, availableKits]);

    useEffect(() => {
        return () => {
            if (suggestListenerRef.current) {
                window.removeEventListener('message', suggestListenerRef.current);
                suggestListenerRef.current = null;
            }
            if (suggestTimeoutRef.current != null) {
                window.clearTimeout(suggestTimeoutRef.current);
            }
        };
    }, []);

    const validateName = (name: string): boolean => {
        if (!name.trim()) {
            setError('Project name is required');
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
        if (validateName(projectName) && selectedKit) {
            onCreate(projectName, framework, selectedKit);
            onClose();
        }
    };

    const handleAISuggest = () => {
        if (!supportsModuleSuggestions) {
            return;
        }

        setAiSuggestLoading(true);
        setAiSuggestions([]);
        setAiSuggestError('');

        if (suggestListenerRef.current) {
            window.removeEventListener('message', suggestListenerRef.current);
        }

        const finishSuggest = (errorMessage?: string, suggestions?: { slug: string; reason: string }[]) => {
            setAiSuggestLoading(false);
            if (suggestTimeoutRef.current != null) {
                window.clearTimeout(suggestTimeoutRef.current);
                suggestTimeoutRef.current = null;
            }
            if (errorMessage) {
                setAiSuggestError(errorMessage);
            } else {
                setAiSuggestions(suggestions ?? []);
            }
            window.removeEventListener('message', listener);
            suggestListenerRef.current = null;
        };

        const listener = (event: MessageEvent) => {
            if (event.data?.command !== 'aiModuleSuggestions') {
                return;
            }
            const payload = event.data?.data ?? event.data ?? {};
            const { loading, suggestions, error: err } = payload as {
                loading?: boolean;
                suggestions?: { slug: string; reason: string }[];
                error?: string;
            };
            if (loading) {
                return;
            }
            finishSuggest(typeof err === 'string' && err.trim() ? err : undefined, suggestions);
        };
        suggestListenerRef.current = listener;
        window.addEventListener('message', listener);
        suggestTimeoutRef.current = window.setTimeout(() => {
            finishSuggest('Module suggestion timed out. Check AI entitlement and retry.');
        }, 30_000);
        vscode.postMessage('aiSuggestModules', { framework, projectName });
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            handleCreate();
        }
    };

    const handleRetryKits = () => {
        vscode.postMessage('requestAvailableKits');
    };

    return (
        <EnterpriseModal
            isOpen={isOpen}
            title={info.title}
            subtitle={info.subtitle}
            kicker="Project operation"
            icon={info.iconUrl ? <img src={info.iconUrl} alt={framework} className="modal-framework-icon" /> : <Package size={16} />}
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
                            Create Project
                        </button>
                    </div>
                </>
            }
        >
            <div className="modal-form-grid">
                <div className="modal-field--wide">
                    <EnterpriseModalNotice tone="info">
                        <Package size={14} />
                        <span>{info.description}</span>
                    </EnterpriseModalNotice>
                </div>

                {framework === 'springboot' && toolStatus && !toolStatus.javaAvailable && (
                    <div className="modal-field--wide">
                        <EnterpriseModalNotice tone="warning">
                            <AlertCircle size={14} />
                            <span>Spring Boot projects require JDK 17+.</span>
                            <button type="button" className="modal-inline-link" onClick={() => vscode.postMessage('openSetup')}>
                                Open Setup
                            </button>
                        </EnterpriseModalNotice>
                    </div>
                )}

                {framework === 'dotnet' && toolStatus && !toolStatus.dotnetAvailable && (
                    <div className="modal-field--wide">
                        <EnterpriseModalNotice tone="warning">
                            <AlertCircle size={14} />
                            <span>.NET Web API projects require the dotnet SDK.</span>
                            <button type="button" className="modal-inline-link" onClick={() => vscode.postMessage('openSetup')}>
                                Open Setup
                            </button>
                        </EnterpriseModalNotice>
                    </div>
                )}

                <label className="modal-field modal-field--wide">
                    <span>Project name</span>
                    <input
                        id="project-name"
                        type="text"
                        value={projectName}
                        onChange={(event) => {
                            setProjectName(event.target.value);
                            validateName(event.target.value);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={info.placeholder}
                        autoFocus
                        spellCheck={false}
                    />
                    {error && (
                        <span className="modal-field__error">
                            <AlertCircle size={12} />
                            {error}
                        </span>
                    )}
                </label>

                <label className="modal-field modal-field--wide">
                    <span>Kit template</span>
                    <select
                        id="kit-select"
                        value={selectedKit}
                        onChange={(event) => setSelectedKit(event.target.value)}
                    >
                        {frameworkKits.length === 0 && <option value="">Loading kits...</option>}
                        {frameworkKits.map((kit) => (
                            <option key={kit.name} value={kit.name}>
                                {kit.display_name} {kit.tags && kit.tags.length > 0 ? `- ${kit.tags.join(', ')}` : ''}
                            </option>
                        ))}
                    </select>
                    {frameworkKits.length === 0 ? (
                        <span className="modal-field__hint">
                            Fetching kits for {framework}.{' '}
                            <button type="button" className="modal-inline-link" onClick={handleRetryKits}>Retry</button>
                        </span>
                    ) : selectedKitData ? (
                        <span className="modal-field__hint">{selectedKitData.description}</span>
                    ) : null}
                </label>

                <EnterpriseModalSection title="Name policy" meta="Project scope">
                    <ul className="modal-compact-list">
                        <li>Use letters, numbers, hyphens, or underscores.</li>
                        <li>Project is created inside the selected workspace.</li>
                        <li>Examples: {framework === 'fastapi' ? 'orders-api, backend-service' : framework === 'nestjs' ? 'admin-api, service-core' : framework === 'go' ? 'worker-service, go-api' : 'orders-service, billing-api'}</li>
                    </ul>
                </EnterpriseModalSection>

                {supportsModuleSuggestions && (
                    <EnterpriseModalSection title="AI module suggestions" meta="Optional">
                        <button
                            type="button"
                            className="enterprise-button enterprise-button--secondary"
                            onClick={handleAISuggest}
                            disabled={aiSuggestLoading}
                        >
                            {aiSuggestLoading ? <Loader2 size={13} className="ai-modal-spinner" /> : <Sparkles size={13} />}
                            {aiSuggestLoading ? 'Asking AI' : 'Suggest modules'}
                        </button>
                        {aiSuggestError && <div className="modal-field__error">{aiSuggestError}</div>}
                        {aiSuggestions.length > 0 && (
                            <div className="modal-suggestion-list">
                                {aiSuggestions.map((suggestion) => (
                                    <div key={suggestion.slug} className="modal-suggestion-row">
                                        <strong>{suggestion.slug}</strong>
                                        <span>{suggestion.reason}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </EnterpriseModalSection>
                )}
            </div>
        </EnterpriseModal>
    );
}
