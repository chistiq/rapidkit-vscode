import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { chatResponseDisplayParts } from './chatResponseParts';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ComposerShell } from './composer/ComposerShell';
import { ChatSessionBar } from './composer/ChatSessionBar';
import { ChatToolsDrawer } from './drawers/ChatToolsDrawer';
import { Drawer } from './drawer/Drawer';
import { SidebarMessage } from './SidebarMessage';
import { ChatImagePreview } from './ChatImagePreview';
import { StudioActionProgress } from './StudioActionProgress';
import type { SidebarStudioApprovalRequestView } from '@/lib/sidebarStudioActionProgress';
import {
  readChatAttachments,
  requestWithAttachments,
  type ChatAttachment,
} from '@/lib/chatAttachments';
import type { SidebarModel } from './sidebarModels';
import {
  basenameFromPath,
  chatSessionContextLabel,
  pendingChatApprovals,
  type ChatModeSuggestion,
  type ChatSession,
  type ChatTurn,
} from './sidebarSessions';
import type { SidebarScope } from './sidebarTypes';

interface ChatTabProps {
  panelId: string;
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
  onSubmit: (question: string, images?: Array<{ mimeType: string; base64: string }>) => void;
  models: SidebarModel[];
  modelLoadError?: string | null;
  selectedModelId: string | null;
  onSelectModel: (id: string | null) => void;
  onRefreshModels?: () => void;
  toolbar?: ReactNode;
  headerChrome?: ReactNode;
  streamChrome?: ReactNode;
  composerReview?: ReactNode;
  renderTurnActions?: (turn: ChatTurn, isLatest: boolean) => ReactNode;
  renderTurnActivity?: (turn: ChatTurn, isLatest: boolean, isCurrentPart: boolean) => ReactNode;
  composerBanner?: ReactNode;
  footerActions?: ReactNode;
  onRunCommand?: (command: string) => void;
  onCopyCommand?: (command: string) => void;
  composerPrefill?: string;
  composerPrefillKey?: number;
  chromeMode?: 'default' | 'repair';
  activityActive?: boolean;
  composerModeSelector?: ReactNode;
  onSteer?: (message: string, images?: Array<{ mimeType: string; base64: string }>) => void;
  onCancel?: () => void;
  onApprovalDecision?: (
    request: SidebarStudioApprovalRequestView,
    execution: 'once' | 'session' | 'project' | undefined
  ) => void;
  onRestoreAttachment?: (turnId: string) => void;
  onAcceptModeSuggestion?: (suggestion: ChatModeSuggestion) => void;
  onDismissModeSuggestion?: () => void;
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
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const attachmentReadRef = useRef(false);
  const attachmentGeneration = useRef(0);
  useEffect(() => {
    attachmentGeneration.current += 1;
    setAttachments([]);
    setAttachmentError('');
  }, [activeSessionId]);
  const followStream = useRef(true);
  const [showJump, setShowJump] = useState(false);
  useEffect(() => {
    followStream.current = true;
    setShowJump(false);
  }, [activeSessionId]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (!active) {
      setHistoryOpen(false);
      setToolsOpen(false);
    }
  }, [active]);
  const lastPrefillKeyRef = useRef<number | undefined>(undefined);
  const streamRef = useRef<HTMLDivElement | null>(null);

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
  const pendingApprovals = pendingChatApprovals(activeSession);
  const waitingForApproval = pendingApprovals.length > 0;
  useEffect(() => {
    const element = streamRef.current;
    if (!active || !element) return;
    const synchronize = () => {
      if (followStream.current) element.scrollTop = element.scrollHeight;
      setShowJump(element.scrollHeight - element.scrollTop - element.clientHeight >= 80);
    };
    const frame =
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(synchronize) : undefined;
    if (frame === undefined) synchronize();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(synchronize);
    observer?.observe(element);
    return () => {
      if (frame !== undefined && typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [active, activeSession?.messages, activeSession?.status, props.activityActive]);
  const running = activeSession?.status === 'streaming' || props.activityActive === true;
  const composerScopeLabel = sessionScopeDisplayName(activeSession, props.scope);
  const scopedPlaceholder = props.placeholder;

  const submit = (text?: string) => {
    const trimmed = (text ?? prompt).trim();
    if ((!trimmed && !attachments.length) || attachmentReadRef.current) {
      return;
    }
    followStream.current = true;
    setShowJump(false);
    if (running && props.onSteer) {
      props.onSteer(
        requestWithAttachments(trimmed, attachments),
        attachments.flatMap((entry) => (entry.image ? [entry.image] : []))
      );
    } else if (!running) {
      props.onSubmit(
        requestWithAttachments(trimmed, attachments),
        attachments.flatMap((entry) => (entry.image ? [entry.image] : []))
      );
    } else {
      return;
    }
    setPrompt('');
    setAttachments([]);
    setToolsOpen(false);
  };

  const drawerNode = (
    <Drawer
      open={toolsOpen}
      sizing="compact"
      title="Chat actions"
      onClose={() => setToolsOpen(false)}
    >
      {props.toolbar ? <div className="ws-drawer-section">{props.toolbar}</div> : null}
      {props.footerActions ? (
        <div className="ws-drawer-inline-actions">{props.footerActions}</div>
      ) : null}
    </Drawer>
  );

  return (
    <section
      id={props.panelId}
      className={`ws-sidebar__tabpanel ws-sidebar__tabpanel--chat${
        props.chromeMode === 'repair' ? ' ws-sidebar__tabpanel--repair' : ''
      }`}
      role="tabpanel"
      aria-labelledby="workspai-sidebar-tab-studio"
      hidden={!active}
    >
      <div className="ws-chat-header">
        <ChatSessionBar
          activeSession={activeSession}
          sessionCount={sessions.length}
          compact={repairMode}
          allowNewSession={!repairMode}
          contextText={
            activeSession?.incident || activeSession?.editorIssue ? composerScopeLabel : null
          }
          onNewSession={() => {
            props.onNewSession();
            setPrompt('');
            setHistoryOpen(false);
            setToolsOpen(false);
          }}
          historyOpen={historyOpen}
          onOpenHistory={() => {
            setHistoryOpen((value) => !value);
            setToolsOpen(false);
          }}
        />
        <ChatToolsDrawer
          open={historyOpen}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onClose={() => setHistoryOpen(false)}
          onNewSession={props.onNewSession}
          onSelectSession={props.onSelectSession}
          onDeleteSession={props.onDeleteSession}
        />
      </div>
      {props.headerChrome ? (
        <div className="ws-sidebar__chat-chrome">{props.headerChrome}</div>
      ) : null}
      <div className="ws-sidebar__stream-wrap">
        <div
          ref={streamRef}
          className="ws-sidebar__stream"
          role="log"
          aria-label={`${props.contextLabel} conversation`}
          aria-live="off"
          aria-busy={Boolean(running && !activeSession?.waitingForInput && !waitingForApproval)}
          tabIndex={0}
          onClickCapture={(event) => {
            const target = event.target as HTMLElement;
            if (
              target.closest?.('.ws-activity') &&
              target.closest('summary, .ws-activity__group-summary, .ws-activity__history')
            ) {
              // Inspecting activity takes precedence over following incoming events.
              followStream.current = false;
              setShowJump(true);
            }
          }}
          onScroll={(event) => {
            const element = event.currentTarget;
            followStream.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 80;
            setShowJump(!followStream.current);
          }}
        >
          {!activeSession || activeSession.messages.length === 0 ? (
            repairMode || hasChromeContent ? null : (
              <div className="ws-sidebar__empty-canvas">
                <span className="ws-sidebar__empty-hint">Ask anything about this workspace</span>
                {props.suggestions.length > 0 ? (
                  <div className="ws-chat-starters" aria-label="Suggested prompts">
                    {props.suggestions.slice(0, 3).map((suggestion) => (
                      <button type="button" key={suggestion} onClick={() => submit(suggestion)}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          ) : (
            activeSession.messages.map((message, idx) => {
              const isLastAssistant =
                message.role === 'assistant' && idx === activeSession.messages.length - 1;
              return (
                <SidebarMessage key={idx} role={message.role === 'user' ? 'user' : 'ai'}>
                  {message.role === 'assistant' ? (
                    chatResponseDisplayParts(message).map((part, partIndex, allParts) =>
                      part.kind === 'activity' ? (
                        <div key={`activity:${activeSessionId}:${message.id ?? idx}:${partIndex}`}>
                          {props.renderTurnActivity?.(
                            { ...message, activity: part.entries },
                            isLastAssistant,
                            isLastAssistant && partIndex === allParts.length - 1
                          )}
                        </div>
                      ) : (
                        <MarkdownRenderer
                          key={`text:${partIndex}`}
                          content={part.text}
                          isStreaming={
                            isLastAssistant &&
                            running &&
                            !activeSession.waitingForInput &&
                            partIndex === allParts.length - 1
                          }
                          onRunCommand={props.onRunCommand}
                          onCopyCommand={props.onCopyCommand}
                        />
                      )
                    )
                  ) : (
                    <UserChatContent content={message.content} />
                  )}
                  {isLastAssistant && props.streamChrome ? (
                    <div className="ws-sidebar__studio-live-activity">{props.streamChrome}</div>
                  ) : null}
                  {message.role === 'assistant'
                    ? props.renderTurnActions?.(message, isLastAssistant)
                    : null}
                  {message.role === 'user' && message.images?.length ? (
                    <div className="ws-sidebar__message-images">
                      {message.images.map((image, imageIndex) => (
                        <ChatImagePreview
                          key={`${activeSessionId}:${message.id ?? idx}:${imageIndex}`}
                          image={image}
                          label={`Attached image ${imageIndex + 1}`}
                          active={active}
                        />
                      ))}
                    </div>
                  ) : message.images?.map((image, imageIndex) => (
                    <img
                      key={imageIndex}
                      src={`data:${image.mimeType};base64,${image.base64}`}
                      alt={`Tool result image ${imageIndex + 1}`}
                      style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                    />
                  ))}
                  {message.attachmentError ? (
                    <small role="status" className="ws-sidebar__attachment-note">
                      {message.attachmentError}
                    </small>
                  ) : null}
                  {message.hasImage && !message.images?.length ? (
                    <small className="ws-sidebar__attachment-note">
                      {message.attachmentStored && message.id && props.onRestoreAttachment ? (
                        <button
                          type="button"
                          onClick={() => props.onRestoreAttachment?.(message.id!)}
                        >
                          Restore saved attachment
                        </button>
                      ) : (
                        'Image unavailable in this restored chat. Attach it again if needed.'
                      )}
                    </small>
                  ) : null}
                </SidebarMessage>
              );
            })
          )}
          {activeSession?.waitingForInput && activeSession.status === 'streaming' ? (
            <div className="ws-sidebar__attachment-note" role="status">
              Waiting for your input. Reply below to continue, or stop this session.
            </div>
          ) : null}
          {!repairMode && activeSession?.status === 'error' && activeSession.error ? (
            <div className="ws-sidebar__error-notice" role="alert">
              {activeSession.error}
            </div>
          ) : null}
          {props.streamChrome &&
          activeSession?.messages[activeSession.messages.length - 1]?.role !== 'assistant' ? (
            <div className="ws-sidebar__studio-live-activity">{props.streamChrome}</div>
          ) : null}
        </div>
        {showJump && (
          <button
            type="button"
            className="ws-sidebar__jump-latest"
            aria-label="Scroll to latest"
            title="Scroll to latest"
            onClick={() => {
              followStream.current = true;
              setShowJump(false);
              const element = streamRef.current;
              if (element) {
                if (typeof element.scrollTo === 'function')
                  element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
                else element.scrollTop = element.scrollHeight;
              }
            }}
          >
            <ArrowDown size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="ws-sidebar__sr-only" role="status" aria-live="polite" aria-atomic="true">
        {waitingForApproval
          ? 'Waiting for command approval. Approve or decline the command below to continue.'
          : activeSession?.waitingForInput
            ? 'Waiting for your input.'
            : running
              ? 'Assistant is working.'
              : activeSession?.status === 'error'
                ? 'Assistant stopped. Review the response for details.'
                : activeSession?.messages.length
                  ? 'Response ready.'
                  : ''}
      </div>

      {!repairMode && activeSession?.modeSuggestion ? (
        <div className="ws-sidebar__mode-suggestion" role="status">
          <div>
            <strong>{activeSession.modeSuggestion.label}</strong>
            <span>{activeSession.modeSuggestion.description}</span>
          </div>
          <div className="ws-sidebar__mode-suggestion-actions">
            <button
              type="button"
              className="ws-sidebar__inline"
              disabled={activeSession.status === 'streaming'}
              onClick={() => props.onAcceptModeSuggestion?.(activeSession.modeSuggestion!)}
            >
              {activeSession.modeSuggestion.label}
            </button>
            <button
              type="button"
              className="ws-sidebar__inline ws-sidebar__inline--quiet"
              disabled={activeSession.status === 'streaming'}
              onClick={props.onDismissModeSuggestion}
            >
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {waitingForApproval && props.onApprovalDecision ? (
        <div
          className="ws-sidebar__approval-dock"
          role="region"
          aria-label="Pending command approvals"
        >
          {pendingApprovals.map((entry) => (
            <StudioActionProgress
              key={`${entry.requestId}:${entry.invocationId}`}
              progress={entry}
              repairBubble
              onApprovalDecision={props.onApprovalDecision}
            />
          ))}
        </div>
      ) : null}
      {props.composerReview ? (
        <div className="ws-sidebar__review-dock" role="region" aria-label="Current request changes">
          {props.composerReview}
        </div>
      ) : null}

      {props.composerBanner ? (
        <div className="ws-sidebar__composer-banner">{props.composerBanner}</div>
      ) : null}

      <ComposerShell
        value={prompt}
        onChange={setPrompt}
        onSubmit={() => submit()}
        placeholder={scopedPlaceholder}
        disabled={attachmentBusy || (running && !props.onSteer)}
        running={running}
        onCancel={props.onCancel}
        models={props.models}
        modelLoadError={props.modelLoadError}
        selectedModelId={props.selectedModelId}
        onSelectModel={props.onSelectModel}
        onRefreshModels={props.onRefreshModels}
        onOpenAdd={
          repairMode || (!props.toolbar && !props.footerActions)
            ? undefined
            : () => {
                setToolsOpen((value) => !value);
                setHistoryOpen(false);
              }
        }
        addLabel={repairMode ? undefined : `${props.contextLabel} tools`}
        drawer={drawerNode}
        modeSelector={props.composerModeSelector}
        hasAttachments={attachments.length > 0}
        onAttach={async (files) => {
          if (attachmentReadRef.current) return;
          attachmentReadRef.current = true;
          setAttachmentBusy(true);
          const generation = attachmentGeneration.current;
          try {
            const next = await readChatAttachments(files, attachments);
            if (generation === attachmentGeneration.current) {
              setAttachments(next);
              setAttachmentError('');
            }
          } catch (error) {
            if (generation === attachmentGeneration.current)
              setAttachmentError(error instanceof Error ? error.message : String(error));
          } finally {
            attachmentReadRef.current = false;
            setAttachmentBusy(false);
          }
        }}
        attachments={
          <>
            {attachments.length > 0 && (
              <div
                className={`ws-composer__attachments${attachments.length > 1 ? ' ws-composer__attachments--multiple' : ''}`}
              >
                {attachments.map((entry, index) => (
                  <span
                    key={`${entry.name}:${index}`}
                    title={entry.name}
                    className={entry.image ? 'ws-composer__attachment--image' : undefined}
                  >
                    {entry.image ? (
                      <ChatImagePreview
                        image={entry.image}
                        label={entry.name}
                        size="composer"
                        active={active}
                      />
                    ) : null}
                    <bdi className="ws-composer__attachment-name">{entry.name}</bdi>
                    <button
                      type="button"
                      aria-label={`Remove ${entry.name}`}
                      onClick={() =>
                        setAttachments((current) => current.filter((_, at) => at !== index))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {attachmentError && (
              <p role="alert" className="ws-composer__attachment-error">
                {attachmentError}
              </p>
            )}
          </>
        }
      />
    </section>
  );
}
