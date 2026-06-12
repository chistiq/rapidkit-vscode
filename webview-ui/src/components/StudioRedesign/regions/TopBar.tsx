import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import {
    IncidentPhase,
    PolicyGateState,
    ReleaseGatePosture,
    ScopeType,
    UserMode,
} from '../state/studioState';
import { ThemeMode } from '../styles/themeSystem';
import { studioClass, releasePostureToneClass } from '../styles/studioUi';
import type { IncidentStudioDisplayMode } from '../../../lib/incidentStudioPreferences';

function TopBarControlGroup(props: {
    label: string;
    children: React.ReactNode;
    compact?: boolean;
}) {
    if (props.compact) {
        return <>{props.children}</>;
    }

    return (
        <div className={studioClass.topbarGroup}>
            <span className={studioClass.topbarGroupLabel}>{props.label}</span>
            <div className={studioClass.topbarGroupBody}>{props.children}</div>
        </div>
    );
}

interface TopBarProps {
    currentPhase: IncidentPhase;
    policyGates: PolicyGateState;
    userMode: UserMode;
    themeMode: ThemeMode;
    scopeType: ScopeType;
    workspaceName?: string;
    releasePosture: ReleaseGatePosture;
    compactMode?: boolean;
    embedded?: boolean;
    /** Nested inside MissionControlHeader — suppress outer chrome */
    merged?: boolean;
    displayMode?: IncidentStudioDisplayMode;
    onDisplayModeChange?: (mode: IncidentStudioDisplayMode) => void;
    telemetryRefreshLabel?: string | null;
    isTelemetryRefreshing?: boolean;
    onTelemetryRefresh?: () => void;
    onUserModeChange: (mode: UserMode) => void;
    onThemeModeChange: (mode: ThemeMode) => void;
    onScopeChange: (scope: ScopeType) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
    policyGates,
    userMode,
    themeMode,
    scopeType,
    workspaceName,
    releasePosture,
    compactMode = false,
    embedded = false,
    merged = false,
    displayMode = 'lite',
    onDisplayModeChange,
    telemetryRefreshLabel = null,
    isTelemetryRefreshing = false,
    onTelemetryRefresh,
    onUserModeChange,
    onThemeModeChange,
    onScopeChange,
}) => {
    void themeMode;
    void onThemeModeChange;

    const [isScopeOpen, setIsScopeOpen] = useState(false);
    const scopeContainerRef = useRef<HTMLDivElement | null>(null);
    const scopeTriggerRef = useRef<HTMLButtonElement | null>(null);
    const scopeOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const scopeOptions: ScopeType[] = ['workspace', 'project'];

    useEffect(() => {
        if (!isScopeOpen) {
            return;
        }

        const handleDocumentMouseDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (scopeContainerRef.current && target && !scopeContainerRef.current.contains(target)) {
                setIsScopeOpen(false);
            }
        };

        const handleDocumentKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsScopeOpen(false);
            }
        };

        document.addEventListener('mousedown', handleDocumentMouseDown);
        document.addEventListener('keydown', handleDocumentKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleDocumentMouseDown);
            document.removeEventListener('keydown', handleDocumentKeyDown);
        };
    }, [isScopeOpen]);

    useEffect(() => {
        if (!isScopeOpen) {
            return;
        }

        const selectedIndex = scopeOptions.indexOf(scopeType);
        const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
        scopeOptionRefs.current[focusIndex]?.focus();
    }, [isScopeOpen, scopeType]);

    const handleScopeTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsScopeOpen(true);
        }
    };

    const handleScopeOptionKeyDown = (
        event: React.KeyboardEvent<HTMLButtonElement>,
        index: number,
        scope: ScopeType,
    ) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setIsScopeOpen(false);
            scopeTriggerRef.current?.focus();
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onScopeChange(scope);
            setIsScopeOpen(false);
            scopeTriggerRef.current?.focus();
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const nextIndex = (index + direction + scopeOptions.length) % scopeOptions.length;
            scopeOptionRefs.current[nextIndex]?.focus();
        }
    };

    const releaseToneClass = releasePostureToneClass(releasePosture);

    const releaseLabel =
        releasePosture === 'go'
            ? 'Release Ready'
            : releasePosture === 'no-go'
                ? 'Blocked'
                : 'Evaluating';

    const topbarClass = [
        studioClass.topbar,
        merged ? 'studio-topbar--merged' : embedded ? studioClass.missionStrip : 'studio-topbar--standalone',
        !merged && !embedded ? studioClass.rail : undefined,
    ].filter(Boolean).join(' ');

    return (
        <header className={topbarClass}>
            {!embedded ? (
                <>
                    <Sparkles
                        size={13}
                        className={`${studioClass.flexShrink0} ${studioClass.toneAccent} ${studioClass.opacity90}`}
                    />
                    <span className={`${studioClass.kicker} ${studioClass.flexShrink0}`}>
                        Incident Studio
                    </span>
                    <span className="studio-topbar__sep">·</span>
                </>
            ) : null}
            <span className="studio-topbar__title">
                {workspaceName || 'Current Workspace'}
            </span>

            <div ref={scopeContainerRef} className={studioClass.relative}>
                <button
                    ref={scopeTriggerRef}
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isScopeOpen}
                    aria-controls="studio-scope-selector"
                    onClick={() => setIsScopeOpen((open) => !open)}
                    onKeyDown={handleScopeTriggerKeyDown}
                    className={studioClass.scopeTrigger}
                >
                    <span className="studio-scope-trigger__label">Scope</span>
                    <span className="studio-scope-trigger__value">
                        {scopeType === 'workspace' ? 'Workspace' : 'Project'}
                    </span>
                    <ChevronDown
                        size={11}
                        className={`${studioClass.chevron}${isScopeOpen ? ' is-open' : ''} ${studioClass.scopeChevron}`}
                    />
                </button>

                {isScopeOpen && (
                    <div
                        id="studio-scope-selector"
                        role="listbox"
                        aria-label="Scope selector"
                        className="studio-scope-menu"
                    >
                        {scopeOptions.map((scope, index) => (
                            <button
                                key={scope}
                                ref={(el) => {
                                    scopeOptionRefs.current[index] = el;
                                }}
                                type="button"
                                role="option"
                                aria-selected={scopeType === scope}
                                onClick={() => {
                                    onScopeChange(scope);
                                    setIsScopeOpen(false);
                                    scopeTriggerRef.current?.focus();
                                }}
                                onKeyDown={(event) => handleScopeOptionKeyDown(event, index, scope)}
                                className={`studio-scope-option${scopeType === scope ? ' is-selected' : ''}`}
                            >
                                <span className="studio-scope-option__title">
                                    {scope === 'workspace' ? 'Workspace Aggregated' : 'Project Scoped'}
                                </span>
                                <span className="studio-scope-option__desc">
                                    {scope === 'workspace'
                                        ? 'Cross-module signals and fleet-level traceability.'
                                        : 'Focused execution against the active module.'}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="studio-topbar__spacer" />

            <div className={studioClass.topbarOpsCluster}>
                <TopBarControlGroup label="Release" compact={compactMode}>
                    <div
                        role="status"
                        aria-label={`Release posture: ${releaseLabel}`}
                        className={`${studioClass.releasePill} ${releaseToneClass}`}
                    >
                        <span
                            className={`studio-release-pill__dot ${releaseToneClass}${releasePosture === 'pending' ? ' is-pulse' : ''}`}
                        />
                        <span>{releaseLabel}</span>
                        {!compactMode ? (
                            <>
                                <span className="studio-release-pill__sep">·</span>
                                <span className="studio-release-pill__flow">
                                    {policyGates.flowState === 'passing'
                                        ? 'Flow verified'
                                        : policyGates.flowState === 'warning'
                                          ? 'Flow degraded'
                                          : 'Flow blocked'}
                                </span>
                            </>
                        ) : null}
                    </div>
                </TopBarControlGroup>

                {onTelemetryRefresh ? (
                    <TopBarControlGroup label="Telemetry" compact={compactMode}>
                        <button
                            type="button"
                            className={`studio-topbar__telemetry${isTelemetryRefreshing ? ' is-refreshing' : ''}`}
                            onClick={onTelemetryRefresh}
                            disabled={isTelemetryRefreshing}
                            title="Refresh studio telemetry"
                            aria-label={
                                isTelemetryRefreshing
                                    ? 'Refreshing studio telemetry'
                                    : telemetryRefreshLabel
                                      ? `Telemetry last refreshed at ${telemetryRefreshLabel}. Click to refresh.`
                                      : 'Refresh studio telemetry'
                            }
                        >
                            {isTelemetryRefreshing
                                ? 'Refreshing…'
                                : compactMode
                                  ? telemetryRefreshLabel ?? '—'
                                  : `Updated · ${telemetryRefreshLabel ?? '—'}`}
                        </button>
                    </TopBarControlGroup>
                ) : null}

                {onDisplayModeChange ? (
                    <TopBarControlGroup label="View" compact={compactMode}>
                        {!compactMode ? (
                            <div
                                role="group"
                                aria-label="Studio view density"
                                className={`${studioClass.segmented} ${studioClass.flexShrink0}`}
                            >
                                {(['lite', 'full'] as IncidentStudioDisplayMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => onDisplayModeChange(mode)}
                                        aria-pressed={displayMode === mode}
                                        title={
                                            mode === 'lite'
                                                ? 'Compact release posture and essentials'
                                                : 'Full operational detail'
                                        }
                                    >
                                        {mode === 'lite' ? 'Lite' : 'Full'}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => onDisplayModeChange(displayMode === 'lite' ? 'full' : 'lite')}
                                title="Toggle lite/full view"
                                className={studioClass.btnGhost}
                            >
                                {displayMode}
                            </button>
                        )}
                    </TopBarControlGroup>
                ) : null}

                <TopBarControlGroup label="Mode" compact={compactMode}>
                    {!compactMode ? (
                        <div
                            role="group"
                            aria-label="User mode"
                            className={`${studioClass.segmented} ${studioClass.flexShrink0}`}
                        >
                            {(['guided', 'standard', 'expert'] as UserMode[]).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => onUserModeChange(mode)}
                                    aria-pressed={userMode === mode}
                                    title={
                                        mode === 'guided'
                                            ? 'Safe step-by-step workflow'
                                            : mode === 'standard'
                                              ? 'Balanced control and automation'
                                              : 'Advanced detail and operator control'
                                    }
                                >
                                    {mode === 'guided' ? 'Guided' : mode === 'standard' ? 'Standard' : 'Expert'}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() =>
                                onUserModeChange(
                                    userMode === 'guided'
                                        ? 'standard'
                                        : userMode === 'standard'
                                          ? 'expert'
                                          : 'guided',
                                )
                            }
                            title="Cycle user mode"
                            className={studioClass.btnGhost}
                        >
                            {userMode}
                        </button>
                    )}
                </TopBarControlGroup>
            </div>
        </header>
    );
};
