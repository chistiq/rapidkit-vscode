# Release Notes — v0.19.0 (April 18, 2026)

## ✦ AI Streaming UX + Model Selector

### Summary

This release fixes the core AI streaming experience and gives users control over which model answers their queries.
Responses now appear token-by-token in real time, a thinking indicator covers the context-scan wait, and a compact model selector in the modal header lets users pick Claude, GPT, Gemini, or any other Copilot-registered model on the fly.

---

### Added

- **AI model selector (inline in modal header)**
  A compact `<select>` dropdown appears in the top-right of the AI modal (before the close button) when any Copilot language models are registered in VS Code.
  - Defaults to **Auto** (respects `workspai.preferredModel` workspace setting)
  - Premium Copilot users see their full model roster; free users see their available models
  - Selection is remembered per session and sent with every query
  - Disabled (grayed out) while a response is streaming

- **Thinking indicator**
  Animated three-dot bouncing indicator shown between query submission and the first token arriving.
  Replaces the empty modal body + blinking cursor that made users think the extension had frozen during the context-scan phase.

- **MarkdownRenderer component** (`webview-ui/src/components/MarkdownRenderer.tsx`)
  Zero-dependency markdown renderer for AI responses supporting:
  - Headings (H1–H3), bold, italic, bold-italic
  - Inline code and fenced code blocks with language label
  - Ordered and unordered lists
  - Horizontal rules, paragraphs

### Fixed

- **Real-time streaming — "all at once" delivery resolved**
  The extension host previously called `postMessage` hundreds of times per second inside the same event-loop tick. VS Code's IPC layer batched all of these into a single delivery, so the webview received nothing until the stream finished — then the full text appeared at once.
  Fixed by introducing a 50 ms `setInterval` flush loop in `welcomePanel.ts`: tokens accumulate in a string buffer and are delivered as one message per interval, giving the webview ~20 smooth updates per second.

- **Streaming render overhead eliminated**
  `MarkdownRenderer` previously ran `parseBlocks()` (an O(n) operation) on every `requestAnimationFrame` during streaming, creating an O(n²) bottleneck that worsened as the response grew.
  Fixed by rendering the raw `content` prop directly during streaming (no parse, no internal state) and performing a single `parseBlocks` pass after `isStreaming` becomes false.

- **Menu item console warning**
  `workbench.actions.treeView.rapidkitProjects.collapseAll` was referenced in `contributes.menus` but not in `contributes.commands`, producing a VS Code activation warning.
  Fixed by removing the manual menu entry and enabling `"showCollapseAll": true` on the `rapidkitProjects` view definition — VS Code renders the collapse button natively with no registration required.

### Changed

- Quick-prompt suggestion chips are now hidden while the modal is in a streaming or thinking state (they were showing as disabled, adding visual noise)
- `listAvailableModels()` added to `aiService.ts` as a public API, used by the model selector to enumerate registered LM chat models
- `streamAIResponse()` accepts an optional `preferredModelId` parameter; when provided, the exact model is used instead of the workspace preference

---

## Links

- 📦 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode)
- 🐙 [GitHub Repository](https://github.com/chistiq/rapidkit-vscode)
- 🌐 [Workspai Website](https://www.workspai.com/)
- 🚀 [RapidKit CLI (npm)](https://www.npmjs.com/package/rapidkit)
