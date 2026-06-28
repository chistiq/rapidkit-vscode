import { type ReactNode, useEffect, useRef, useState } from 'react';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ComposerShell } from './composer/ComposerShell';
import { ChatSessionBar } from './composer/ChatSessionBar';
import { ChatToolsDrawer } from './drawers/ChatToolsDrawer';
import { SidebarMessage } from './SidebarMessage';
import type { SidebarModel } from './sidebarModels';
import type { ChatSession } from './sidebarSessions';
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
  footerActions?: ReactNode;
  onRunCommand?: (command: string) => void;
  onCopyCommand?: (command: string) => void;
  composerPrefill?: string;
  composerPrefillKey?: number;
}

export function ChatTab(props: ChatTabProps) {
  const { active, sessions, activeSessionId, composerPrefill, composerPrefillKey } = props;
  const [prompt, setPrompt] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const lastPrefillKeyRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!composerPrefill?.trim()) {
      return;
    }
    if (composerPrefillKey === lastPrefillKeyRef.current) {
      return;
    }
    lastPrefillKeyRef.current = composerPrefillKey;
    setPrompt(composerPrefill.trim());
  }, [composerPrefill, composerPrefillKey]);

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId) ?? null;

  const submit = (text?: string) => {
    const trimmed = (text ?? prompt).trim();
    if (!trimmed || activeSession?.status === 'streaming') {
      return;
    }
    props.onSubmit(trimmed);
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
      suggestions={props.suggestions}
      onClose={() => setToolsOpen(false)}
      onNewSession={props.onNewSession}
      onSelectSession={props.onSelectSession}
      onDeleteSession={props.onDeleteSession}
      onPickSuggestion={submit}
      toolbar={props.toolbar}
      footerActions={props.footerActions}
    />
  );

  return (
    <section
      className="ws-sidebar__tabpanel ws-sidebar__tabpanel--chat"
      role="tabpanel"
      aria-label={props.contextLabel}
      hidden={!active}
    >
      {props.headerChrome}
      <div className="ws-sidebar__stream" aria-live="polite">
        {!activeSession || activeSession.messages.length === 0 ? (
          <SidebarMessage role="ai">
            <strong>{props.contextLabel}</strong>
            <p>
              Ask about this scope. Follow-ups stay in the same thread — use{' '}
              <strong>New chat</strong> when you switch topics.
            </p>
          </SidebarMessage>
        ) : (
          activeSession.messages.map((message, idx) => {
            const isLastAssistant =
              message.role === 'assistant' && idx === activeSession.messages.length - 1;
            const agentActive = isLastAssistant && activeSession.status === 'streaming';
            return (
              <SidebarMessage
                key={idx}
                role={message.role === 'user' ? 'user' : 'ai'}
                agentActive={agentActive}
              >
                {message.role === 'assistant' ? (
                  <MarkdownRenderer
                    content={message.content}
                    isStreaming={isLastAssistant && activeSession.status === 'streaming'}
                    onRunCommand={props.onRunCommand}
                    onCopyCommand={props.onCopyCommand}
                  />
                ) : (
                  <p>{message.content}</p>
                )}
              </SidebarMessage>
            );
          })
        )}
        {activeSession?.status === 'error' && activeSession.error ? (
          <SidebarMessage role="ai">
            <strong>Stopped.</strong>
            <p>{activeSession.error}</p>
          </SidebarMessage>
        ) : null}
      </div>

      <ChatSessionBar
        activeSession={activeSession}
        sessionCount={sessions.length}
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
        placeholder={props.placeholder}
        disabled={activeSession?.status === 'streaming'}
        models={props.models}
        selectedModelId={props.selectedModelId}
        onSelectModel={props.onSelectModel}
        onRefreshModels={props.onRefreshModels}
        onOpenAdd={() => setToolsOpen((v) => !v)}
        addLabel={`${props.contextLabel} tools`}
        drawer={drawerNode}
      />
    </section>
  );
}
