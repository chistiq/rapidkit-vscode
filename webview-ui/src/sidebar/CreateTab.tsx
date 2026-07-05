import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ComposerShell } from './composer/ComposerShell';
import { CreateAddDrawer, type CreateDrawerId } from './drawers/CreateAddDrawer';
import { ManualProjectDrawer } from './drawers/ManualProjectDrawer';
import {
  ManualWorkspaceDrawer,
  type ManualWorkspaceInput,
} from './drawers/ManualWorkspaceDrawer';
import { SidebarMessage } from './SidebarMessage';
import type { SidebarModel } from './sidebarModels';
import type { SidebarScope } from './sidebarTypes';
import type { CreateMessage, CreationPlan } from './createTypes';
import {
  resolveWorkspacePlaceholder,
  stackLaneLabel,
  type CreationStackLane,
} from '@/lib/creationPresets';

interface CreateTabProps {
  active: boolean;
  busy: boolean;
  messages: CreateMessage[];
  models: SidebarModel[];
  selectedModelId: string | null;
  onSelectModel: (id: string | null) => void;
  onRefreshModels?: () => void;
  scope: SidebarScope;
  initialDrawer?: CreateDrawerId;
  initialDrawerKey?: number;
  onSubmitPrompt: (prompt: string, stackFocus: string) => void;
  onApprovePlan: (plan: CreationPlan) => void;
  onRevisePlan: () => void;
  onManualCreate: (input: ManualWorkspaceInput | { mode: 'project'; name: string; framework: string }) => void;
  onBootstrapWorkspace: (input: {
    workspacePath: string;
    workspaceName?: string;
    profile?: string;
  }) => void;
  onFocusView: (target: 'workspaces' | 'projects') => void;
}

export function CreateTab(props: CreateTabProps) {
  const { active, busy, messages, models, selectedModelId, onSelectModel, scope } = props;
  const [prompt, setPrompt] = useState('');
  const [stackLane, setStackLane] = useState<CreationStackLane>('balanced');
  const [drawer, setDrawer] = useState<CreateDrawerId>(null);

  useEffect(() => {
    if (!active || !props.initialDrawer || !props.initialDrawerKey) {
      return;
    }
    setDrawer(props.initialDrawer);
  }, [active, props.initialDrawer, props.initialDrawerKey]);

  const closeDrawer = () => setDrawer(null);

  const submitPrompt = () => {
    const trimmed = prompt.trim();
    if (!trimmed || busy) {
      return;
    }
    props.onSubmitPrompt(trimmed, stackLaneLabel(stackLane));
    setPrompt('');
    closeDrawer();
  };

  const openFromAdd = (next: CreateDrawerId) => {
    setDrawer(next);
  };

  const handleWorkspaceCreate = (input: ManualWorkspaceInput) => {
    props.onManualCreate(input);
    closeDrawer();
  };

  const handleProjectCreate = (input: { name: string; framework: string }) => {
    props.onManualCreate({ mode: 'project', ...input });
    closeDrawer();
  };

  const drawerNode = (
    <>
      <CreateAddDrawer
        open={drawer === 'add'}
        stackLane={stackLane}
        onStackLaneChange={setStackLane}
        onClose={closeDrawer}
        onOpenWorkspace={() => openFromAdd('workspace')}
        onOpenProject={() => openFromAdd('project')}
        onPickQuickStart={(text) => {
          setPrompt(text);
          closeDrawer();
        }}
      />
      <ManualWorkspaceDrawer
        open={drawer === 'workspace'}
        busy={busy}
        onClose={closeDrawer}
        onCreate={handleWorkspaceCreate}
        onUseAi={closeDrawer}
      />
      <ManualProjectDrawer
        open={drawer === 'project'}
        busy={busy}
        scope={scope}
        onClose={closeDrawer}
        onCreate={handleProjectCreate}
      />
    </>
  );

  return (
    <section
      className="ws-sidebar__tabpanel ws-sidebar__tabpanel--chat"
      role="tabpanel"
      aria-label="Create with AI"
      hidden={!active}
    >
      <div className="ws-sidebar__stream" aria-live="polite">
        <SidebarMessage role="ai">
          <strong>What are we building?</strong>
          <p>Describe the product or workspace. Use + to create manually or pick a quick start.</p>
        </SidebarMessage>
        {messages.map((message, index) => (
          <CreateMessageView
            key={message.id}
            message={message}
            agentActive={
              busy &&
              index === messages.length - 1 &&
              (message.kind === 'thinking' || message.kind === 'progress')
            }
            onApprove={props.onApprovePlan}
            onRevise={props.onRevisePlan}
            onFocus={props.onFocusView}
            onCreateManual={() => setDrawer('workspace')}
            onBootstrapWorkspace={props.onBootstrapWorkspace}
          />
        ))}
      </div>

      <ComposerShell
        value={prompt}
        onChange={setPrompt}
        onSubmit={submitPrompt}
        placeholder={resolveWorkspacePlaceholder(stackLane)}
        disabled={busy}
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={onSelectModel}
        onRefreshModels={props.onRefreshModels}
        onOpenAdd={() => setDrawer((d) => (d === 'add' ? null : 'add'))}
        addLabel="Create options"
        drawer={drawerNode}
      />
    </section>
  );
}

function looksLikeFilesystemPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.startsWith('~') ||
    /^[A-Za-z]:\\/.test(trimmed)
  );
}

function displayNameFromPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = trimmed.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function CreateMessageView({
  message,
  agentActive = false,
  onApprove,
  onRevise,
  onFocus,
  onCreateManual,
  onBootstrapWorkspace,
}: {
  message: CreateMessage;
  agentActive?: boolean;
  onApprove: (plan: CreationPlan) => void;
  onRevise: () => void;
  onFocus: (target: 'workspaces' | 'projects') => void;
  onCreateManual: () => void;
  onBootstrapWorkspace: (input: {
    workspacePath: string;
    workspaceName?: string;
    profile?: string;
  }) => void;
}) {
  const role = message.role === 'user' ? 'user' : 'ai';

  return (
    <SidebarMessage role={role} agentActive={agentActive}>
      {renderCreateBody(
        message,
        { onApprove, onRevise, onFocus, onCreateManual, onBootstrapWorkspace },
        agentActive
      )}
    </SidebarMessage>
  );
}

function renderCreateBody(
  message: CreateMessage,
  actions: {
    onApprove: (plan: CreationPlan) => void;
    onRevise: () => void;
    onFocus: (target: 'workspaces' | 'projects') => void;
    onCreateManual: () => void;
    onBootstrapWorkspace: (input: {
      workspacePath: string;
      workspaceName?: string;
      profile?: string;
    }) => void;
  },
  agentActive = false
) {
  switch (message.kind) {
    case 'text':
      return <p>{message.text}</p>;
    case 'thinking':
      return (
        <p className="ws-sidebar__thinking">
          {message.label}
          {agentActive ? <LoadingDots /> : null}
        </p>
      );
    case 'progress':
      return (
        <>
          <p className={`ws-sidebar__thinking${agentActive ? '' : ' ws-sidebar__thinking--done'}`}>
            {!agentActive ? (
              <Check size={12} strokeWidth={2.5} aria-hidden="true" className="ws-sidebar__step-check" />
            ) : null}
            <strong>
              {message.title}
              {agentActive ? <LoadingDots /> : null}
            </strong>
          </p>
          {message.detail && !looksLikeFilesystemPath(message.detail) ? (
            <p>{message.detail}</p>
          ) : null}
        </>
      );
    case 'plan': {
      const plan = message.plan;
      const modules =
        plan.suggestedModules?.length > 0
          ? plan.suggestedModules.join(', ')
          : 'No optional modules selected';
      return (
        <>
          <strong>I inferred this creation plan.</strong>
          {message.planSource === 'heuristic' ? (
            <p className="ws-sidebar__plan-note">
              Local planner — AI was unavailable; review the stack before continuing.
            </p>
          ) : null}
          <div className="ws-sidebar__plan">
            <PlanItem label="Profile" value={plan.profile} />
            <PlanItem label="Workspace" value={plan.workspaceName} />
            <PlanItem
              label="Project"
              value={`${plan.projectName} · ${plan.framework} · ${plan.kit}`}
            />
            {plan.secondaryProject ? (
              <PlanItem
                label="Companion"
                value={`${plan.secondaryProject.projectName} · ${plan.secondaryProject.framework}`}
              />
            ) : null}
            <PlanItem label="Modules" value={modules} />
          </div>
          {message.resolved ? null : (
            <div className="ws-sidebar__inline-actions">
              <button type="button" className="ws-sidebar__inline" onClick={() => actions.onApprove(plan)}>
                Approve and continue
              </button>
              <button type="button" className="ws-sidebar__inline" onClick={actions.onRevise}>
                Revise
              </button>
            </div>
          )}
        </>
      );
    }
    case 'done': {
      const projects = message.projects ?? [];
      return (
        <>
          <strong>Workspace and project are ready.</strong>
          <div className="ws-sidebar__inline-actions">
            <button type="button" className="ws-sidebar__inline" onClick={() => actions.onFocus('workspaces')}>
              Show Workspaces
            </button>
            <button type="button" className="ws-sidebar__inline" onClick={() => actions.onFocus('projects')}>
              Show Projects
            </button>
          </div>
          {projects.length > 0 ? (
            <div className="ws-sidebar__plan">
              {projects.map((p, i) => (
                <PlanItem key={i} label="Project" value={`${p.name ?? 'Project'} · ${p.framework ?? ''}`} />
              ))}
            </div>
          ) : null}
        </>
      );
    }
    case 'manual-done':
      const canBootstrapWorkspace = Boolean(message.workspacePath);
      const workspaceLabel =
        message.mode === 'workspace'
          ? message.name || displayNameFromPath(message.workspacePath)
          : displayNameFromPath(message.workspacePath);
      const projectLabel =
        message.mode === 'project' ? message.name || displayNameFromPath(message.projectPath) : undefined;
      return (
        <>
          <strong>{message.mode === 'project' ? 'Project created.' : 'Workspace created.'}</strong>
          {message.summary ? <p>{message.summary}</p> : null}
          {workspaceLabel || projectLabel ? (
            <p className="ws-sidebar__path-hint">
              {projectLabel ? <>Project: {projectLabel}</> : null}
              {projectLabel && workspaceLabel ? ' · ' : null}
              {workspaceLabel ? <>Workspace: {workspaceLabel}</> : null}
            </p>
          ) : null}
          <div className="ws-sidebar__inline-actions">
            {canBootstrapWorkspace ? (
              <button
                type="button"
                className="ws-sidebar__inline"
                onClick={() =>
                  actions.onBootstrapWorkspace({
                    workspacePath: message.workspacePath as string,
                    workspaceName: message.mode === 'workspace' ? message.name : undefined,
                    profile: message.profile,
                  })
                }
              >
                Bootstrap workspace
              </button>
            ) : null}
            <button
              type="button"
              className="ws-sidebar__inline"
              onClick={() => actions.onFocus(message.mode === 'project' ? 'projects' : 'workspaces')}
            >
              {message.mode === 'project' ? 'Show Projects' : 'Show Workspaces'}
            </button>
          </div>
        </>
      );
    case 'error':
      if (message.unsupportedStack) {
        return (
          <>
            <strong>This stack is not a native scaffold yet.</strong>
            <p>{message.error}</p>
            <div className="ws-sidebar__inline-actions">
              <button type="button" className="ws-sidebar__inline" onClick={actions.onCreateManual}>
                Create governed workspace
              </button>
            </div>
          </>
        );
      }
      return (
        <>
          <strong>Creation stopped.</strong>
          <p>{message.error}</p>
        </>
      );
    default:
      return null;
  }
}

function PlanItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="ws-sidebar__plan-item">
      <span className="ws-sidebar__plan-key">{label}</span>
      <span className="ws-sidebar__plan-value">{value}</span>
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="ws-sidebar__dots" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}
