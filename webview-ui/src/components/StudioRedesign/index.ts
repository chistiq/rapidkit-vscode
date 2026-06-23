/**
 * Studio contracts shared by host/webview bridges and sidebar flows.
 * Full Incident Studio dashboard UI has been removed — Studio lives in the secondary sidebar.
 */

export * from './state/studioState';
export * from './state/studioActions';
export { buildStudioPosture } from './state/studioPosture';
export { buildStudioActionAuditTimeline } from './state/studioActionAudit';
export { buildStudioActionApprovalGate } from './state/studioActionApproval';
export { normalizeThemeMode, type ThemeMode } from './styles/themeSystem';
