/**
 * Shared Studio UI class names + tiny style helpers.
 * Classes are defined in workspai-studio.css + workspai-studio-chrome.css and read --ws-* tokens.
 */

/** CSS class registry — keep in sync with workspai-studio.css + workspai-studio-chrome.css */
export const studioClass = {
  shell: 'studio-shell',
  shellEmbedded: 'studio-shell studio-shell--embedded',
  embeddedHost: 'ws-embedded-host',
  workspace: 'studio-workspace',
  workspaceGrid: 'studio-workspace-grid',
  paneActivity: 'studio-pane-activity',
  paneSidebar: 'studio-pane-sidebar',
  paneContext: 'studio-pane-context',
  paneChat: 'studio-pane-chat',
  paneChatAdjacent: 'studio-pane-chat studio-pane-chat--adjacent',
  flexShrink0: 'studio-u-flex-shrink-0',
  relative: 'studio-u-relative',
  stackSm: 'studio-u-stack-sm',
  stackMd: 'studio-u-stack-md',
  rowSm: 'studio-u-row-sm',
  rowMd: 'studio-u-row-md',
  between: 'studio-u-between',
  scrollSection: 'studio-u-scroll-section',
  toneOk: 'studio-tone-ok',
  toneWarn: 'studio-tone-warn',
  toneError: 'studio-tone-error',
  toneAccent: 'studio-tone-accent',
  tonePrimary: 'studio-tone-primary',
  traceGrid3: 'studio-trace-grid studio-trace-grid--3',
  banner: 'studio-banner',
  bannerWarn: 'studio-banner studio-banner--warn',
  bannerError: 'studio-banner studio-banner--error',
  bannerActions: 'studio-banner__actions',
  rail: 'studio-rail',
  kicker: 'studio-kicker',
  segmented: 'studio-segmented',
  sectionLabel: 'studio-section-label',
  panelHeader: 'studio-panel-header',
  panelHeaderTitle: 'studio-panel-header__title',
  panelHeaderMeta: 'studio-panel-header__meta',
  card: 'studio-card',
  cardActive: 'studio-card is-active',
  navItem: 'studio-nav-item',
  navItemActive: 'studio-nav-item is-active',
  chip: 'studio-chip',
  chipActive: 'studio-chip is-active',
  badge: 'studio-badge',
  badgeWarn: 'studio-badge is-warn',
  metric: 'studio-metric',
  metricValue: 'studio-metric__value',
  metricValueFull: 'studio-metric__value--full',
  metricLabel: 'studio-metric__label',
  emptyState: 'studio-empty-state',
  emptyStateTitle: 'studio-empty-state__title',
  emptyStateBody: 'studio-empty-state__body',
  composer: 'studio-composer',
  composerField: 'studio-composer__field',
  btn: 'studio-btn',
  btnPrimary: 'studio-btn studio-btn--primary',
  btnGhost: 'studio-btn studio-btn--ghost',
  btnAccent: 'studio-btn studio-btn--accent',
  collapseTrigger: 'studio-collapse-trigger',
  statusPill: 'studio-status-pill',
  missionStrip: 'studio-mission-strip',
  missionControl: 'studio-mission-control',
  missionControlIdentity: 'studio-mission-control__identity',
  missionControlOps: 'studio-mission-control__ops',
  topbarGroup: 'studio-topbar__group',
  topbarGroupLabel: 'studio-topbar__group-label',
  topbarGroupBody: 'studio-topbar__group-body',
  topbarOpsCluster: 'studio-topbar__ops-cluster',
  contextSection: 'studio-context-section',
  chatHeader: 'studio-chat-header',
  chatTimeline: 'studio-chat-timeline',
  phaseStepper: 'studio-phase-stepper',
  phaseStep: 'studio-phase-step',
  field: 'studio-field',
  fieldSelect: 'studio-field studio-field--select',
  auditRow: 'studio-audit-row',
  signalRow: 'studio-signal-row',
  moduleRow: 'studio-module-row',
  traceGrid: 'studio-trace-grid',
  traceTile: 'studio-trace-tile',
  postmortemCard: 'studio-postmortem-card',
  quickBar: 'studio-quick-bar',
  phaseGate: 'studio-phase-gate',
  composerMeta: 'studio-composer-meta',
  messageThread: 'studio-message-thread',
  messageRow: 'studio-message-row',
  btnSuccess: 'studio-btn studio-btn--success',
  btnOutlineSuccess: 'studio-btn studio-btn--outline-success',
  sidebar: 'studio-sidebar',
  sidebarScroll: 'studio-sidebar__scroll',
  sidebarSection: 'studio-sidebar__section',
  sidebarFooter: 'studio-sidebar__footer',
  activityBar: 'studio-activity-bar',
  topbar: 'studio-topbar',
  scopeTrigger: 'studio-scope-trigger',
  scopeChevron: 'studio-scope-trigger__chevron',
  releasePill: 'studio-release-pill',
  inspector: 'studio-inspector',
  commandRibbon: 'studio-command-ribbon',
  contextPanel: 'studio-context-panel',
  message: 'studio-message',
  messageUser: 'studio-message studio-message--user',
  messageAssistant: 'studio-message studio-message--assistant',
  streaming: 'studio-streaming',
  starterActions: 'studio-starter-actions',
  chatSurface: 'studio-chat-surface',
  minW0: 'studio-u-min-w-0',
  flex1: 'studio-u-flex-1',
  selfStart: 'studio-u-self-start',
  mlAuto: 'studio-u-ml-auto',
  mtSm: 'studio-u-mt-sm',
  mbSm: 'studio-u-mb-sm',
  preWrap: 'studio-u-pre-wrap',
  textCenter: 'studio-u-text-center',
  uppercase: 'studio-u-uppercase',
  opacity90: 'studio-u-opacity-90',
  fw650: 'studio-u-fw-650',
  fw750: 'studio-u-fw-750',
  stackXs: 'studio-u-stack-xs',
  wrap: 'studio-u-wrap',
  flexGrowField: 'studio-u-flex-grow-field',
  bodySmall: 'studio-u-body-small',
  caption: 'studio-u-caption',
  captionSmall: 'studio-u-caption-small',
  h2: 'studio-u-h2',
  h3: 'studio-u-h3',
  chevron: 'studio-chevron',
  postureCard: 'studio-posture-card',
  postureCardDot: 'studio-posture-card__dot',
  postureCardLabel: 'studio-posture-card__label',
  postureCardProof: 'studio-posture-card__proof',
  healthSummary: 'studio-health-summary',
  healthMetrics: 'studio-health-metrics',
  releasePostureTitle: 'studio-release-posture__title',
  releaseArtifact: 'studio-release-artifact',
  jumpLatest: 'studio-jump-latest',
  suggestionRow: 'studio-suggestion-row',
  composerInput: 'studio-composer__input',
  decisionDeckHead: 'studio-decision-deck__head',
  decisionDeckCard: 'studio-decision-deck-card',
  decisionDeckSummary: 'studio-decision-deck__summary',
  decisionDeckActions: 'studio-decision-deck__actions',
  decisionDeckExpanded: 'studio-decision-deck__expanded',
  decisionDeckAssumptions: 'studio-decision-deck__assumptions',
  postmortemEmoji: 'studio-postmortem-emoji',
  actionGateCard: 'studio-action-gate-card',
  moduleGraphFilters: 'studio-module-graph-filters',
  moduleGraphFiltersRow: 'studio-module-graph-filters__row',
  moduleGroupHead: 'studio-module-group-head',
  moduleGroupTitle: 'studio-module-group-title',
  moduleEmpty: 'studio-module-empty',
  moduleRowClickable: 'studio-module-row--clickable',
  approvalCardHead: 'studio-approval-card__head',
  approvalMetricGrid: 'studio-approval-card__metric-grid',
  approvalMetric: 'studio-approval-card__metric',
  approvalHolds: 'studio-approval-card__holds',
  approvalCheck: 'studio-approval-check',
  approvalCheckInput: 'studio-approval-check__input',
  reviewLine: 'studio-review-line',
  reviewList: 'studio-review-list',
  reviewItem: 'studio-review-item',
  reviewItemMono: 'studio-review-item--mono',
  registryCardHead: 'studio-registry-card__head',
  registryCardMeta: 'studio-registry-card__meta',
  registryCardExecution: 'studio-registry-card__execution',
  signalRowIcon: 'studio-signal-row__icon',
  sidebarCollapse: 'studio-sidebar-collapse',
  sidebarCollapseBody: 'studio-sidebar-collapse__body',
  sidebarInspectorWrap: 'studio-sidebar-inspector-wrap',
  inspectorHead: 'studio-inspector-head',
  inspectorHeadContent: 'studio-inspector-head__content',
  collapseTitle: 'studio-collapse-trigger__title',
  collapseChevron: 'studio-collapse-trigger__chevron',
  cardFull: 'studio-card--full',
  cardFooterEnd: 'studio-card__footer-end',
  failedCommands: 'studio-sidebar-failed-commands',
  navItemIcon: 'studio-nav-item__icon',
  navItemLabel: 'studio-nav-item__label',
  navItemAction: 'studio-nav-item__action',
  errorBoundary: 'studio-error-boundary',
  errorBoundaryBadge: 'studio-error-boundary__badge',
  errorBoundaryMessage: 'studio-error-boundary__message',
  errorBoundaryRetry: 'studio-error-boundary__retry',
  codeBreak: 'studio-u-code-break',
  fw600: 'studio-u-fw-600',
  lineHeight145: 'studio-u-line-height-145',
} as const;

export function auditOutcomeToneClass(outcome: string): string {
  switch (outcome) {
    case 'approved':
    case 'completed':
    case 'verified':
    case 'applied':
      return studioClass.toneOk;
    case 'approval-revoked':
    case 'proposed':
    case 'needs-review':
    case 'stale':
      return studioClass.toneWarn;
    case 'failed':
    case 'blocked':
      return studioClass.toneError;
    case 'running':
    case 'requested':
      return studioClass.toneAccent;
    case 'rolled-back':
      return studioClass.tonePrimary;
    default:
      return 'studio-tone-muted';
  }
}

export function actionStabilityClass(stability: 'stable' | 'governed' | 'analysis'): string {
  if (stability === 'stable') {
    return studioClass.toneOk;
  }
  if (stability === 'analysis') {
    return studioClass.toneWarn;
  }
  return studioClass.toneAccent;
}

export function actionRuntimeToneClass(options: {
  blocked: boolean;
  proposed: boolean;
  readyFallback?: 'ok' | 'warn';
}): string {
  if (options.blocked) {
    return studioClass.toneError;
  }
  if (options.proposed) {
    return studioClass.toneWarn;
  }
  if (options.readyFallback === 'warn') {
    return studioClass.toneWarn;
  }
  return studioClass.toneOk;
}

export function chipFadeClass(staggerIndex?: number): string {
  if (staggerIndex === undefined) {
    return '';
  }
  const delayClass = ['studio-chip--fade-0', 'studio-chip--fade-1', 'studio-chip--fade-2'][
    staggerIndex
  ];
  return delayClass ? `studio-chip--fade ${delayClass}` : '';
}

export function approvalToneClass(tone: string): string {
  if (tone === 'ok') {
    return studioClass.toneOk;
  }
  if (tone === 'warning') {
    return studioClass.toneWarn;
  }
  if (tone === 'error') {
    return studioClass.toneError;
  }
  return 'studio-tone-muted';
}

export function policyGateStateClass(state: string): string {
  if (state === 'passing' || state === 'complete') {
    return studioClass.toneOk;
  }
  if (state === 'warning' || state === 'partial') {
    return studioClass.toneWarn;
  }
  if (state === 'blocking' || state === 'stale') {
    return studioClass.toneError;
  }
  return 'studio-tone-muted';
}

export function moduleSeverityClass(severity: string): string {
  if (severity === 'healthy' || severity === 'ok') {
    return studioClass.toneOk;
  }
  if (severity === 'warning' || severity === 'warn') {
    return studioClass.toneWarn;
  }
  return studioClass.toneError;
}

export function lifecycleStatusClass(status: string): string {
  if (status === 'verified' || status === 'applied' || status === 'rolled-back') {
    return studioClass.toneOk;
  }
  if (status === 'blocked' || status === 'stale' || status === 'applied-failed-verify') {
    return studioClass.toneError;
  }
  return studioClass.toneWarn;
}

export function contractValidationClass(status: string): string {
  if (status === 'valid') {
    return studioClass.toneOk;
  }
  if (status === 'blocked') {
    return studioClass.toneError;
  }
  return studioClass.toneWarn;
}

export function riskToneClass(risk: string): string {
  if (risk === 'Low') {
    return studioClass.toneOk;
  }
  if (risk === 'Moderate') {
    return studioClass.toneWarn;
  }
  return studioClass.toneError;
}

export function releasePostureToneClass(posture: string): string {
  if (posture === 'go') {
    return studioClass.toneOk;
  }
  if (posture === 'no-go') {
    return studioClass.toneError;
  }
  return studioClass.toneWarn;
}

export function postureToneClass(tone: 'ok' | 'warning' | 'error' | string): string {
  if (tone === 'ok') {
    return studioClass.toneOk;
  }
  if (tone === 'warning') {
    return studioClass.toneWarn;
  }
  if (tone === 'error') {
    return studioClass.toneError;
  }
  return '';
}

export function studioToneClass(tone: string): string {
  switch (tone) {
    case 'ok':
    case 'healthy':
    case 'pass':
      return studioClass.toneOk;
    case 'warn':
    case 'warning':
      return studioClass.toneWarn;
    case 'error':
    case 'fail':
    case 'critical':
      return studioClass.toneError;
    case 'accent':
      return studioClass.toneAccent;
    case 'primary':
      return studioClass.tonePrimary;
    default:
      return '';
  }
}
