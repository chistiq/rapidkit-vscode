/**
 * Lightweight markdown renderer for AI response output.
 * No external dependencies — handles common AI output patterns:
 *   headings, bold, italic, inline code, fenced code blocks,
 *   unordered/ordered lists, horizontal rules, and paragraphs.
 *
 * Safety notes:
 *   - INLINE_RE is created fresh per call (no shared mutable /g state)
 *   - parseBlocks is guarded with a hard line-count cap (DoS prevention)
 *   - MarkdownRenderer throttles updates to one paint per animation frame
 *     during streaming to prevent O(n²) re-parse behaviour freezing VS Code
 */

import { useState, useEffect, useMemo } from 'react';
import { Copy, Play } from 'lucide-react';
import { compactStudioPathText } from '@/lib/studioDisplayText';
import {
    extractStudioRunnableCommandFromLine,
    normalizeStudioRunnableCommand,
} from '@/lib/studioCommandActions';

// ─── Inline tokens ────────────────────────────────────────────────────────────

type InlineToken =
    | { t: 'text'; v: string }
    | { t: 'code'; v: string }
    | { t: 'bold'; v: string }
    | { t: 'italic'; v: string }
    | { t: 'bold_italic'; v: string };

// IMPORTANT: regex is constructed fresh on every call — avoids the shared
// mutable lastIndex state that a module-level /g regex carries between calls.
function tokenizeInline(text: string): InlineToken[] {
    // Bail out on suspiciously long lines to prevent backtracking on degenerate
    // input (e.g. a 20 000-char line with many unclosed * characters).
    if (text.length > 4000) {
        return [{ t: 'text', v: text }];
    }

    const INLINE_RE = /(`[^`]+?`|\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g;
    const tokens: InlineToken[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = INLINE_RE.exec(text)) !== null) {
        if (m.index > last) {
            tokens.push({ t: 'text', v: text.slice(last, m.index) });
        }
        const raw = m[0];
        if (raw.startsWith('`')) {
            tokens.push({ t: 'code', v: raw.slice(1, -1) });
        } else if (raw.startsWith('***')) {
            tokens.push({ t: 'bold_italic', v: raw.slice(3, -3) });
        } else if (raw.startsWith('**')) {
            tokens.push({ t: 'bold', v: raw.slice(2, -2) });
        } else {
            tokens.push({ t: 'italic', v: raw.slice(1, -1) });
        }
        last = m.index + raw.length;
    }
    if (last < text.length) {
        tokens.push({ t: 'text', v: text.slice(last) });
    }
    return tokens;
}

function renderInline(text: string, keyPfx: string): JSX.Element[] {
    return tokenizeInline(text).map((tok, i) => {
        const k = `${keyPfx}-${i}`;
        switch (tok.t) {
            case 'code':
                return <code key={k} className="md-inline-code">{tok.v}</code>;
            case 'bold':
                return <strong key={k}>{tok.v}</strong>;
            case 'italic':
                return <em key={k}>{tok.v}</em>;
            case 'bold_italic':
                return <strong key={k}><em>{tok.v}</em></strong>;
            default:
                return <span key={k}>{tok.v}</span>;
        }
    });
}

// ─── Block tokens ─────────────────────────────────────────────────────────────

type Block =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'codeblock'; lang: string; lines: string[] }
    | { type: 'ul'; items: string[] }
    | { type: 'ol'; items: string[] }
    | { type: 'hr' }
    | { type: 'paragraph'; lines: string[] };

function isFenceOpen(line: string): RegExpMatchArray | null {
    return line.match(/^\s*```([\w-]*)\s*$/);
}

function isFenceClose(line: string): boolean {
    return /^\s*```\s*$/.test(line);
}

function parseBlocks(markdown: string): Block[] {
    const rawLines = markdown.split('\n');

    // Hard cap: never process more than 2000 lines in one call —
    // protects against a runaway response freezing the webview.
    const lines = rawLines.length > 2000 ? rawLines.slice(-2000) : rawLines;

    const blocks: Block[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // ── Fenced code block ───────────────────────────────────────────────
        const codeOpen = isFenceOpen(line);
        if (codeOpen) {
            const lang = codeOpen[1] || '';
            const codeLines: string[] = [];
            i++;
            // Guard: also stop at a hard cap to prevent runaway consumption
            // when the closing fence hasn't arrived yet (mid-stream).
            const codeStart = i;
            while (
                i < lines.length &&
                !isFenceClose(lines[i]) &&
                i - codeStart < 500
            ) {
                codeLines.push(lines[i]);
                i++;
            }
            if (i < lines.length && isFenceClose(lines[i])) {
                i++; // consume closing ```
            }
            blocks.push({ type: 'codeblock', lang, lines: codeLines });
            continue;
        }

        // ── Heading ─────────────────────────────────────────────────────────
        const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
            const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
            blocks.push({ type: 'heading', level, text: headingMatch[2].trim() });
            i++;
            continue;
        }

        // ── Horizontal rule ─────────────────────────────────────────────────
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
            blocks.push({ type: 'hr' });
            i++;
            continue;
        }

        // ── Unordered list ──────────────────────────────────────────────────
        if (/^[-*+]\s/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
                items.push(lines[i].replace(/^[-*+]\s+/, ''));
                i++;
            }
            blocks.push({ type: 'ul', items });
            continue;
        }

        // ── Ordered list ────────────────────────────────────────────────────
        if (/^\d+\.\s/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
                items.push(lines[i].replace(/^\d+\.\s+/, ''));
                i++;
            }
            blocks.push({ type: 'ol', items });
            continue;
        }

        // ── Blank line ──────────────────────────────────────────────────────
        if (line.trim() === '') {
            i++;
            continue;
        }

        // ── Paragraph ───────────────────────────────────────────────────────
        const paraLines: string[] = [];
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !lines[i].match(/^#{1,3}\s/) &&
            !isFenceOpen(lines[i]) &&
            !lines[i].match(/^[-*+]\s/) &&
            !lines[i].match(/^\d+\.\s/) &&
            !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
        ) {
            paraLines.push(lines[i]);
            i++;
        }
        if (paraLines.length > 0) {
            blocks.push({ type: 'paragraph', lines: paraLines });
        } else {
            // Safety fallback: this line matched nothing — emit as text and advance
            // to prevent an infinite loop on unexpected input.
            blocks.push({ type: 'paragraph', lines: [line] });
            i++;
        }
    }

    return blocks;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MarkdownRendererProps {
    content: string;
    isStreaming?: boolean;
    onCopyCommand?: (command: string) => void;
    onRunCommand?: (command: string) => void;
}

function commandFromParagraphLine(line: string): string | null {
    return extractStudioRunnableCommandFromLine(line);
}

function copyText(text: string, onCopyCommand?: (command: string) => void): void {
    const runnable = normalizeStudioRunnableCommand(text);
    if (runnable && onCopyCommand) {
        onCopyCommand(runnable);
        return;
    }
    void navigator.clipboard?.writeText(text);
}

export function MarkdownRenderer({
    content,
    isStreaming,
    onCopyCommand,
    onRunCommand,
}: MarkdownRendererProps) {
    // During streaming we render the raw `content` prop directly — zero internal
    // state, zero RAF, zero useMemo.  Every time the parent re-renders with a new
    // chunk, this component immediately paints it.
    //
    // Once streaming ends we do ONE parseBlocks pass and switch to formatted output.
    const [finalContent, setFinalContent] = useState('');

    useEffect(() => {
        if (!isStreaming && content) {
            setFinalContent(content);
        }
        if (!content) {
            setFinalContent('');
        }
    }, [isStreaming, content]);

    const blocks = useMemo(() => parseBlocks(finalContent), [finalContent]);

    if (isStreaming) {
        return (
            <div className="md-body md-streaming">
                {compactStudioPathText(content)}
                <span className="ai-modal-cursor" aria-hidden="true">▍</span>
            </div>
        );
    }

    const renderBlock = (block: Block, idx: number) => {
        const keyPfx = `b${idx}`;
        switch (block.type) {
            case 'heading': {
                const cls = `md-h${block.level}`;
                if (block.level === 1) {return <h1 key={idx} className={cls}>{renderInline(block.text, keyPfx)}</h1>;}
                if (block.level === 2) {return <h2 key={idx} className={cls}>{renderInline(block.text, keyPfx)}</h2>;}
                return <h3 key={idx} className={cls}>{renderInline(block.text, keyPfx)}</h3>;
            }
            case 'codeblock': {
                const codeText = block.lines.join('\n');
                const runnableCommand = normalizeStudioRunnableCommand(codeText);
                const displayCodeText = compactStudioPathText(codeText);
                return (
                    <div key={idx} className="md-code-block">
                        <div className="md-code-block__head">
                            {block.lang ? (
                                <div className="md-code-lang">{block.lang}</div>
                            ) : (
                                <div className="md-code-lang">command</div>
                            )}
                            <div className="md-code-block__actions">
                                <button
                                    type="button"
                                    className="md-code-action"
                                    onClick={() => copyText(codeText, onCopyCommand)}
                                    title={runnableCommand ? 'Copy command' : 'Copy code'}
                                    aria-label={runnableCommand ? 'Copy command' : 'Copy code'}
                                >
                                    <Copy size={12} />
                                </button>
                                {runnableCommand && onRunCommand ? (
                                    <button
                                        type="button"
                                        className="md-code-action md-code-action--run"
                                        onClick={() => onRunCommand(runnableCommand)}
                                        title="Run command"
                                        aria-label="Run command"
                                    >
                                        <Play size={12} />
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <pre className="md-code-pre"><code>{displayCodeText}</code></pre>
                    </div>
                );
            }
            case 'ul':
                return (
                    <ul key={idx} className="md-ul">
                        {block.items.map((item, j) => (
                            <li key={j} className="md-li">{renderInline(item, `${keyPfx}-${j}`)}</li>
                        ))}
                    </ul>
                );
            case 'ol':
                return (
                    <ol key={idx} className="md-ol">
                        {block.items.map((item, j) => (
                            <li key={j} className="md-li">{renderInline(item, `${keyPfx}-${j}`)}</li>
                        ))}
                    </ol>
                );
            case 'hr':
                return <hr key={idx} className="md-hr" />;
            case 'paragraph':
                return (
                    <div key={idx} className="md-p">
                        {block.lines.map((line, j) => {
                            const command = commandFromParagraphLine(line);
                            if (command) {
                                const displayCommand = compactStudioPathText(command);
                                return (
                                    <div key={j} className="md-command-card">
                                        <span className="md-command-card__label">Command</span>
                                        <code>{displayCommand}</code>
                                        <div className="md-command-card__actions">
                                            <button
                                                type="button"
                                                className="md-code-action"
                                                onClick={() => copyText(command, onCopyCommand)}
                                                title="Copy command"
                                                aria-label="Copy command"
                                            >
                                                <Copy size={12} />
                                            </button>
                                            {onRunCommand ? (
                                                <button
                                                    type="button"
                                                    className="md-code-action md-code-action--run"
                                                    onClick={() => onRunCommand(command)}
                                                    title="Run command"
                                                    aria-label="Run command"
                                                >
                                                    <Play size={12} />
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <span key={j}>
                                    {j > 0 && <br />}
                                    {renderInline(line, `${keyPfx}-${j}`)}
                                </span>
                            );
                        })}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="md-body">
            {blocks.map(renderBlock)}
        </div>
    );
}
