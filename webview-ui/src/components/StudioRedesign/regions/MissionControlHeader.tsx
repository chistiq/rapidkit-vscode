/**
 * Mission Control Header — unified identity strip + operational command row.
 * Replaces separate TopBar + CommandRibbon with one sticky control plane.
 */

import React from 'react';
import {
    AIActionRegistryView,
    IncidentPhase,
    PolicyGateState,
    ReleaseGatePosture,
    ScopeType,
    StudioActionStatus,
    StudioEvidenceSummary,
    UserMode,
} from '../state/studioState';
import { StudioActionCommand } from '../state/studioActions';
import { ThemeMode } from '../styles/themeSystem';
import { studioClass } from '../styles/studioUi';
import type { LiteReleaseState } from '../../../lib/incidentStudioLiteMode';
import type { IncidentStudioDisplayMode } from '../../../lib/incidentStudioPreferences';
import { TopBar } from './TopBar';
import { CommandRibbon } from './CommandRibbon';

export interface MissionControlHeaderProps {
    currentPhase: IncidentPhase;
    policyGates: PolicyGateState;
    userMode: UserMode;
    themeMode: ThemeMode;
    scopeType: ScopeType;
    workspaceName?: string;
    releasePosture: ReleaseGatePosture;
    studioEvidence?: StudioEvidenceSummary;
    aiActionRegistry?: AIActionRegistryView | null;
    studioActionStatus?: StudioActionStatus | null;
    compactMode?: boolean;
    embedded?: boolean;
    displayMode?: IncidentStudioDisplayMode;
    liteReleaseState?: LiteReleaseState | null;
    telemetryRefreshLabel?: string | null;
    isTelemetryRefreshing?: boolean;
    onDisplayModeChange?: (mode: IncidentStudioDisplayMode) => void;
    onTelemetryRefresh?: () => void;
    onUserModeChange: (mode: UserMode) => void;
    onThemeModeChange: (mode: ThemeMode) => void;
    onScopeChange: (scope: ScopeType) => void;
    onExecuteAction: (command: StudioActionCommand) => void;
}

export const MissionControlHeader: React.FC<MissionControlHeaderProps> = ({
    currentPhase,
    policyGates,
    userMode,
    themeMode,
    scopeType,
    workspaceName,
    releasePosture,
    studioEvidence,
    aiActionRegistry,
    studioActionStatus,
    compactMode = false,
    embedded = false,
    displayMode = 'full',
    liteReleaseState = null,
    telemetryRefreshLabel = null,
    isTelemetryRefreshing = false,
    onDisplayModeChange,
    onTelemetryRefresh,
    onUserModeChange,
    onThemeModeChange,
    onScopeChange,
    onExecuteAction,
}) => (
    <div
        className={`${studioClass.missionControl}${embedded ? ' is-embedded' : ''}`}
        aria-label="Mission control"
    >
        <div className={studioClass.missionControlIdentity}>
            <TopBar
                currentPhase={currentPhase}
                policyGates={policyGates}
                userMode={userMode}
                themeMode={themeMode}
                scopeType={scopeType}
                workspaceName={workspaceName}
                releasePosture={releasePosture}
                compactMode={compactMode}
                embedded={embedded}
                merged
                displayMode={displayMode}
                onDisplayModeChange={onDisplayModeChange}
                telemetryRefreshLabel={telemetryRefreshLabel}
                isTelemetryRefreshing={isTelemetryRefreshing}
                onTelemetryRefresh={onTelemetryRefresh}
                onUserModeChange={onUserModeChange}
                onThemeModeChange={onThemeModeChange}
                onScopeChange={onScopeChange}
            />
        </div>
        <div className={studioClass.missionControlOps}>
            <CommandRibbon
                currentPhase={currentPhase}
                releasePosture={releasePosture}
                policyGates={policyGates}
                studioEvidence={studioEvidence}
                aiActionRegistry={aiActionRegistry}
                studioActionStatus={studioActionStatus}
                compactMode={compactMode}
                merged
                displayMode={displayMode}
                liteReleaseState={liteReleaseState}
                onExecuteAction={onExecuteAction}
            />
        </div>
    </div>
);
