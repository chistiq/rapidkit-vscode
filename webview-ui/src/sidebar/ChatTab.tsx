import { type ReactNode, useEffect, useRef, useState } from 'react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ComposerShell } from './composer/ComposerShell';
import { ChatSessionBar } from './composer/ChatSessionBar';
import { ChatToolsDrawer } from './drawers/ChatToolsDrawer';
import { SidebarMessage } from './SidebarMessage';
import type { SidebarModel } from './sidebarModels';
import { basenameFromPath, chatSessionContextLabel, type ChatSession } from './sidebarSessions';
import type { SidebarScope } from './sidebarTypes';

interface ChatTabProps {
  active: boolean;
  contextLabel: string;
  placeholder: string;
  scope: SidebarScope;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  suggestions: string[];
  onSubmit: (question: string) => void;
  models: SidebarModel[];
  selectedModelId: string | null;
  onSelectModel: (id: string | null) => void;
  onRefreshModels?: () => void;
  toolbar?: ReactNode;
  headerChrome?: ReactNode;
  streamChrome?: ReactNode;
  footerActions?: ReactNode;
  onRunCommand?: (command: string) => void;
  onCopyCommand?: (command: string) => void;
  composerPrefill?: string;
  composerPrefillKey?: number;
  chromeMode?: 'default' | 'repair';
  activityActive?: boolean;
  composerModeSelector?: ReactNode;
  onSteer?: (message: string) => void;
  onCancel?: () => void;
}

function scopeDisplayName(scope: SidebarScope): string {
  const workspace = scopeWorkspaceName(scope);
  if (!workspace) {
    return 'No workspace selected';
  }
  const project = scope.projectName || basenameFromPath(scope.projectPath);
  return project ? `${workspace} / ${project}` : `${workspace} / workspace`;
}

function scopeWorkspaceName(scope: SidebarScope): string | undefined {
  return scope.workspaceName || basenameFromPath(scope.workspacePath);
}

function sessionScopeDisplayName(session: ChatSession | null, fallback: SidebarScope): string {
  if (session?.editorIssue || session?.incident || session?.scope) {
    return chatSessionContextLabel(session);
  }
  return scopeDisplayName(fallback);
}

function UserChatContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > 720 || content.split('\n').length > 10;
  const visible = isLong && !expanded ? `${content.slice(0, 520).trimEnd()}…` : content;

  return (
    <div className="ws-sidebar__user-content">
      <MarkdownRenderer content={visible} />
      {isLong ? (
        <button
          type="button"
          className="ws-sidebar__message-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show full request'}
        </button>
      ) : null}
    </div>
  );
}

export function ChatTab(props: ChatTabProps) {
  const { active, sessions, activeSessionId, composerPrefill, composerPrefillKey } = props;
  const repairMode = props.chromeMode === 'repair';
  const hasChromeContent = Boolean(props.headerChrome || props.streamChrome);
  const [prompt, setPrompt] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const lastPrefillKeyRef = useRef<number | undefined>(undefined);
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!composerPrefill?.trim()) {
      if (repairMode && composerPrefillKey !== lastPrefillKeyRef.current) {
        lastPrefillKeyRef.current = composerPrefillKey;
        setPrompt('');
      }
      return;
    }
    if (composerPrefillKey === lastPrefillKeyRef.current) {
      return;
    }
    lastPrefillKeyRef.current = composerPrefillKey;
    setPrompt(composerPrefill.trim());
  }, [composerPrefill, composerPrefillKey, repairMode]);

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId) ?? null;
  useEffect(() => {
    if (!active || (!props.activityActive && activeSession?.status !== 'streaming')) {
      return;
    }
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [active, activeSession?.messages, activeSession?.status, props.activityActive]);
  const composerScopeLabel = sessionScopeDisplayName(activeSession, props.scope);
  const scopedPlaceholder =
    !repairMode && composerScopeLabel && composerScopeLabel !== 'No workspace selected'
      ? `${props.placeholder} · ${composerScopeLabel}`
      : props.placeholder;

  const submit = (text?: string) => {
    const trimmed = (text ?? prompt).trim();
    if (!trimmed) {
      return;
    }
    if (activeSession?.status === 'streaming' && props.onSteer) {
      props.onSteer(trimmed);
    } else if (activeSession?.status !== 'streaming') {
      props.onSubmit(trimmed);
    } else {
      return;
    }
    setPrompt('');
    setToolsOpen(false);
  };

  const drawerNode = (
    <ChatToolsDrawer
      open={toolsOpen}
      contextLabel={props.contextLabel}
      scope={props.scope}
      sessions={sessions}
      activeSessionId={activeSessionId}
      onClose={() => setToolsOpen(false)}
      onNewSession={props.onNewSession}
      onSelectSession={props.onSelectSession}
      onDeleteSession={props.onDeleteSession}
      onPickSuggestion={submit}
      toolbar={repairMode ? undefined : props.toolbar}
      footerActions={repairMode ? undefined : props.footerActions}
      suggestions={repairMode ? [] : props.suggestions}
    />
  );

  return (
    <section
      className={`ws-sidebar__tabpanel ws-sidebar__tabpanel--chat${
        props.chromeMode === 'repair' ? ' ws-sidebar__tabpanel--repair' : ''
      }`}
      role="tabpanel"
      aria-label={props.contextLabel}
      hidden={!active}
    >
      {props.headerChrome ? (
        <div className="ws-sidebar__chat-chrome">{props.headerChrome}</div>
      ) : null}
      <div className="ws-sidebar__stream" aria-live="polite">
        {!activeSession || activeSession.messages.length === 0 ? (
          repairMode || hasChromeContent ? null : (
            <SidebarMessage role="ai">
              <strong>{props.contextLabel}</strong>
              <p>
                Ask about this scope. Follow-ups stay in the same thread — use{' '}
                <strong>New chat</strong> when you switch topics.
              </p>
            </SidebarMessage>
          )
        ) : (
          activeSession.messages.map((message, idx) => {
            const isLastAssistant =
              message.role === 'assistant' && idx === activeSession.messages.length - 1;
            const agentActive = isLastAssistant && activeSession.status === 'streaming';
            return (
              <SidebarMessage key={idx} role={message.role === 'user' ? 'user' : 'ai'}>
                {message.role === 'assistant' ? (
                  <MarkdownRenderer
                    content={message.content}
                    isStreaming={isLastAssistant && activeSession.status === 'streaming'}
                    onRunCommand={props.onRunCommand}
                    onCopyCommand={props.onCopyCommand}
                  />
                ) : (
                  <UserChatContent content={message.content} />
                )}
              </SidebarMessage>
            );
          })
        )}
        {activeSession?.status === 'error' && activeSession.error ? (
          <SidebarMessage role="ai">
            <strong>Studio paused.</strong>
            <p>{activeSession.error}</p>
          </SidebarMessage>
        ) : null}
        {props.streamChrome ? (
          <SidebarMessage role="ai">
            <div className="ws-sidebar__studio-live-activity">{props.streamChrome}</div>
          </SidebarMessage>
        ) : null}
        <div ref={streamEndRef} aria-hidden="true" />
      </div>

      <ChatSessionBar
        activeSession={activeSession}
        sessionCount={sessions.length}
        compact={repairMode}
        allowNewSession={!repairMode}
        onNewSession={() => {
          props.onNewSession();
          setPrompt('');
        }}
        onOpenHistory={() => setToolsOpen(true)}
      />

      <ComposerShell
        value={prompt}
        onChange={setPrompt}
        onSubmit={() => submit()}
        placeholder={scopedPlaceholder}
        disabled={activeSession?.status === 'streaming' && !props.onSteer}
        running={activeSession?.status === 'streaming'}
        onCancel={props.onCancel}
        models={props.models}
        selectedModelId={props.selectedModelId}
        onSelectModel={props.onSelectModel}
        onRefreshModels={props.onRefreshModels}
        onOpenAdd={repairMode ? undefined : () => setToolsOpen((v) => !v)}
        addLabel={repairMode ? undefined : `${props.contextLabel} tools`}
        contextLabel={composerScopeLabel}
        drawer={drawerNode}
        modeSelector={props.composerModeSelector}
      />
    </section>
  );
}
