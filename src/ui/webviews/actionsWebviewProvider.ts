/**
 * Actions Webview Provider
 * Minimal sidebar webview for quick actions
 */

import * as vscode from 'vscode';

export class ActionsWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'rapidkitActionsWebview';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'aiQuickActions':
          vscode.commands.executeCommand('workspai.aiQuickActions');
          break;
        case 'createWithAI':
          vscode.commands.executeCommand('workspai.openAICreateWorkspace');
          break;
        case 'openWorkspaceModal':
          vscode.commands.executeCommand('workspai.openWorkspaceModal');
          break;
        case 'showTelemetry':
          vscode.commands.executeCommand('workspai.showTelemetrySummary');
          break;
        case 'resetTelemetry':
          vscode.commands.executeCommand('workspai.resetTelemetry');
          break;
        case 'showOnboarding':
          vscode.commands.executeCommand('workspai.showAIFeatureOnboarding');
          break;
        case 'showOnboardingStats':
          vscode.commands.executeCommand('workspai.showOnboardingExperimentStats');
          break;
        case 'doctor':
          vscode.commands.executeCommand('workspai.doctor');
          break;
        case 'showLogs':
          vscode.commands.executeCommand('workspai.showLogs');
          break;
        case 'openDocs':
          vscode.env.openExternal(vscode.Uri.parse('https://www.workspai.com/docs'));
          break;
        case 'openWelcome':
          vscode.commands.executeCommand('workspai.showWelcome');
          break;
        case 'incidentStudioNext':
          vscode.commands.executeCommand('workspai.openIncidentStudio');
          break;
        case 'releaseReadinessCommander':
          vscode.commands.executeCommand('workspai.aiReleaseReadinessCommander', {
            source: 'sidebar-quick-actions',
            trigger: 'release-readiness-commander',
          });
          break;
      }
    });
  }

  public refresh() {
    if (this._view) {
      this._view.webview.html = this._getHtmlContent(this._view.webview);
    }
  }

  private _getHtmlContent(_webview: vscode.Webview): string {
    // SVG icons (inline since codicons don't work in webviews)
    const icons = {
      workspace:
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 3H7.71l-.85-.85L6.51 2h-5l-.5.5v11l.5.5h13l.5-.5v-10L14.5 3zm-.51 8.49V13h-12V7h4.49l.35-.15.86-.86H14v5.5h-.01zM6.51 6l-.35.15-.86.86h-2.79V3h4.29l.85.85.36.15H14v2H6.51z"/></svg>',
      modules:
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 2L1 3.5v9L3.5 14h3L9 12.5v-9L6.5 2h-3zM3 12V4h3v8H3zm4 0V4h3v8H7zm6-8h-3l-.5.5v9l.5.5h3l.5-.5v-9L13.5 4z"/></svg>',
      doctor:
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M14 2H8L7 3v2H2.5l-.5.5v9l.5.5h11l.5-.5v-9L13.5 5H9V3.5l.5-.5H14V2zM7 5h6v1H7V5zm6 9H3V7h5v1.5l.5.5H13v5zm0-6H9V7h4v1z"/><path d="M5 9H4v1h1V9zm0 2H4v1h1v-1zm2-2H6v1h1V9zm0 2H6v1h1v-1z"/></svg>',
      logs: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h12v12H2V2zm1 1v10h10V3H3zm1 2h8v1H4V5zm0 2h8v1H4V7zm0 2h5v1H4V9z"/></svg>',
      ai: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.2 3.3L12.5 5.5l-3.3 1.2L8 10 6.8 6.7 3.5 5.5l3.3-1.2L8 1zm5 7l.7 1.8 1.8.7-1.8.7L13 13l-.7-1.8-1.8-.7 1.8-.7L13 8zM3 9l.5 1.3 1.3.5-1.3.5L3 12.5l-.5-1.3-1.3-.5 1.3-.5L3 9z"/></svg>',
      telemetry:
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 13h12v1H1V2h1v11zm2-2h1V7H4v4zm3 0h1V4H7v7zm3 0h1V9h-1v2zm3 0h1V6h-1v5z"/></svg>',
      tip: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a5 5 0 0 0-3 9v2.5l.5.5h5l.5-.5V10A5 5 0 0 0 8 1zm2 8.1-.3.2-.2.4V12H6.5V9.7l-.2-.4-.3-.2A4 4 0 1 1 12 6a4 4 0 0 1-2 3.1zM7 13h2v1H7v-1z"/></svg>',
      experiment:
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M6 1v1h1v3.2L3.3 11a2 2 0 0 0 1.7 3h6a2 2 0 0 0 1.7-3L9 5.2V2h1V1H6zm2 4.8 3.6 5.6a1 1 0 0 1-.8 1.6H5a1 1 0 0 1-.8-1.6L8 5.8zM6.8 9h2.4l.8 1.2H6z"/></svg>',
      docs: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 1H4v14h1V1zm7 0h-1v14h1V1zM3 3H1v10h2V3zm12 0h-2v10h2V3zM7 4H6v8h1V4zm3 0H9v8h1V4z"/></svg>',
      home: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146zM2.5 14V7.707l5.5-5.5 5.5 5.5V14H10v-4a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5v4H2.5z"/></svg>',
      release:
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2.2 4.5L15 6.2l-3.5 3.3.8 4.8L8 12l-4.3 2.3.8-4.8L1 6.2l4.8-.7L8 1zm0 2.2L6.5 6.1l-3.1.4 2.3 2.2-.5 3.1L8 10.2l2.8 1.6-.5-3.1 2.3-2.2-3.1-.4L8 3.2z"/></svg>',
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

        button {
            appearance: none;
            font: inherit;
            color: var(--vscode-foreground);
            background: none;
            border: none;
            cursor: pointer;
        }
        button:focus-visible {
          outline: 2px solid var(--vscode-focusBorder);
          outline-offset: 2px;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background: transparent;
            padding: 10px 8px 14px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        :root {
          --cta-press-scale: 0.985;
          --cta-hover-lift: -1px;
          --cta-transition-fast: 160ms cubic-bezier(0.2, 0, 0, 1);
        }

        .doctor  { --c: var(--vscode-editorWarning-foreground, #FF9800); }
        .welcome { --c: var(--vscode-textLink-foreground,  #00cfc1); }
        .docs    { --c: var(--vscode-terminal-ansiBlue,    #2196F3); }
        .ai      { --c: var(--vscode-textLink-foreground, #00cfc1); }
        .telemetry { --c: var(--vscode-terminal-ansiBlue, #7aa2f7); }
        .tip     { --c: var(--vscode-editorWarning-foreground, #f2cc60); }
        .experiment { --c: var(--vscode-charts-green, #8bcf7f); }
        .danger  { --c: var(--vscode-errorForeground, #f14c4c); }
        .manual  { --c: var(--vscode-descriptionForeground, #888); }

        /* ── Primary AI CTA ─────────────────────────────── */
        .cta-ai {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 11px 12px;
            background: linear-gradient(135deg,
              color-mix(in srgb, var(--vscode-button-background) 18%, var(--vscode-editor-background) 82%),
              color-mix(in srgb, var(--vscode-textLink-foreground) 12%, var(--vscode-editor-background) 88%)
            );
            border: 1px solid color-mix(in srgb, var(--vscode-button-background) 45%, transparent 55%);
            border-radius: 9px;
            transition:
              background var(--cta-transition-fast),
              border-color var(--cta-transition-fast),
              color var(--cta-transition-fast),
              box-shadow var(--cta-transition-fast),
              transform var(--cta-transition-fast);
            position: relative;
            overflow: hidden;
            color: var(--vscode-button-foreground);
        }
        .cta-ai::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg,
              color-mix(in srgb, var(--vscode-button-background) 30%, transparent 70%),
              color-mix(in srgb, var(--vscode-textLink-foreground) 20%, transparent 80%)
            );
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .cta-ai:hover::before { opacity: 1; }
        .cta-ai:hover {
          transform: translateY(var(--cta-hover-lift));
          box-shadow: 0 3px 12px color-mix(in srgb, var(--vscode-button-background) 25%, transparent 75%);
        }
        .cta-ai:active { transform: translateY(0) scale(var(--cta-press-scale)); }
        .cta-ai-icon {
            font-size: 14px;
          color: var(--vscode-button-foreground);
            position: relative;
            z-index: 1;
          filter: drop-shadow(0 0 4px color-mix(in srgb, var(--vscode-button-background) 60%, transparent 40%));
        }
        .cta-ai-label {
            position: relative;
            z-index: 1;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 1px;
        }
        .cta-ai-title {
            font-size: 12px;
            font-weight: 700;
          color: var(--vscode-button-foreground);
            letter-spacing: 0.02em;
        }
        .cta-ai-sub {
            font-size: 9.5px;
            color: var(--vscode-descriptionForeground);
          opacity: 0.9;
            -webkit-text-fill-color: var(--vscode-descriptionForeground);
        }

        /* ── Manual / secondary CTA ─────────────────────── */
        .cta-manual {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 7px 10px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border, transparent);
            border-radius: 7px;
            transition:
              background var(--cta-transition-fast),
              border-color var(--cta-transition-fast),
              color var(--cta-transition-fast),
              transform var(--cta-transition-fast),
              box-shadow var(--cta-transition-fast);
            color: var(--vscode-descriptionForeground);
        }
        .cta-manual:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: color-mix(in srgb, var(--vscode-descriptionForeground) 40%, transparent 60%);
            color: var(--vscode-foreground);
            transform: translateY(var(--cta-hover-lift));
        }
          .cta-manual:active { transform: translateY(0) scale(var(--cta-press-scale)); }
        .cta-manual-icon { font-size: 13px; opacity: 0.7; }
        .cta-manual-text { font-size: 11px; font-weight: 600; }

        /* ── Section label ──────────────────────────────── */
        .section-label {
            font-size: 9.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--vscode-descriptionForeground);
          opacity: 0.72;
            padding: 0 1px;
            margin-bottom: -2px;
        }

        /* ── Tool grid (3 cols) ──────────────────────────── */
        .tool-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 5px;
        }

        @media (max-width: 320px) {
          .tool-grid {
            grid-template-columns: 1fr;
          }
        }
        .tool-btn {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 8px 9px;
          min-height: 36px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid transparent;
            border-radius: 7px;
            transition:
              background var(--cta-transition-fast),
              border-color var(--cta-transition-fast),
              color var(--cta-transition-fast),
              transform var(--cta-transition-fast),
              box-shadow var(--cta-transition-fast);
        }
        .tool-btn:hover {
            background: color-mix(in srgb, var(--c, #00cfc1) 10%, var(--vscode-list-hoverBackground) 90%);
            border-color: color-mix(in srgb, var(--c, #00cfc1) 55%, transparent 45%);
            transform: translateY(var(--cta-hover-lift));
        }
        .tool-btn:active { transform: translateY(0) scale(var(--cta-press-scale)); }
        .tool-btn .t-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }
        .tool-btn .t-icon svg {
            width: 14px;
            height: 14px;
            fill: var(--vscode-descriptionForeground);
            transition: fill 0.15s;
        }
        .tool-btn:hover .t-icon svg { fill: var(--c); }
        .tool-btn .t-text {
          font-size: 11px;
            font-weight: 600;
            color: var(--vscode-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .tool-btn:hover .t-text { color: var(--c); }

        .hairline {
            height: 1px;
            background: var(--vscode-panel-border);
            opacity: 0.2;
        }

        @media (prefers-contrast: more) {
          .cta-ai {
            border-color: var(--vscode-focusBorder);
          }

          .cta-ai-title {
            background: none;
            -webkit-text-fill-color: currentColor;
          }

          .cta-ai-sub,
          .section-label {
            opacity: 1;
          }

          .tool-btn,
          .cta-manual {
            border-color: var(--vscode-panel-border);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .cta-ai,
          .cta-ai::before,
          .cta-manual,
          .tool-btn,
          .tool-btn .t-icon svg {
            transition-duration: 1ms !important;
          }

          .cta-ai:hover,
          .cta-ai:active,
          .cta-manual:hover,
          .cta-manual:active,
          .tool-btn:hover,
          .tool-btn:active {
            transform: none !important;
          }
        }

        @media (forced-colors: active) {
          .cta-ai,
          .cta-manual,
          .tool-btn {
            background: Canvas;
            color: CanvasText;
            border: 1px solid ButtonBorder;
            box-shadow: none;
          }

          .cta-ai::before {
            content: none;
          }

          .cta-ai-title {
            background: none;
            color: ButtonText;
            -webkit-text-fill-color: ButtonText;
          }

          .cta-ai-sub,
          .section-label,
          .tool-btn .t-icon svg,
          .tool-btn .t-text {
            color: CanvasText;
            fill: CanvasText;
            opacity: 1;
          }

          .tool-btn:hover,
          .cta-manual:hover,
          .cta-ai:hover {
            background: Highlight;
            color: HighlightText;
          }

          button:focus-visible {
            outline: 2px solid Highlight;
          }
        }
    </style>
</head>
<body>

    <!-- ① Primary: Create with AI -->
    <button class="cta-ai" onclick="send('createWithAI')" title="Describe what you want to build — AI creates your workspace">
        <span class="cta-ai-icon">✦</span>
        <span class="cta-ai-label">
            <span class="cta-ai-title">Create with AI</span>
            <span class="cta-ai-sub">Describe → AI plans → You confirm</span>
        </span>
    </button>

    <!-- ② Secondary: manual workspace -->
    <button class="cta-manual" onclick="send('openWorkspaceModal')" title="Create workspace manually">
        <span class="cta-manual-icon">＋</span>
        <span class="cta-manual-text">New Workspace (manual)</span>
    </button>

    <div class="hairline"></div>

    <!-- ③ Quick tools -->
    <div class="section-label">Quick Actions</div>
    <div class="tool-grid">
        <button class="tool-btn welcome" onclick="send('openWelcome')" title="Open Workspai dashboard">
            <span class="t-icon">${icons.home}</span>
            <span class="t-text">Dashboard</span>
        </button>

        <button class="tool-btn docs" onclick="send('openDocs')" title="Open documentation">
            <span class="t-icon">${icons.docs}</span>
            <span class="t-text">Docs</span>
        </button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function send(cmd) { vscode.postMessage({ command: cmd }); }
    </script>
</body>
</html>`;
  }

  dispose() {}
}
