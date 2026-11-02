/**
 * Lightweight markdown renderer for AI response output.
 * Handles common AI output patterns without raw HTML evaluation:
 *   headings, bold, italic, inline code, fenced code blocks,
 *   unordered/ordered lists, horizontal rules, and paragraphs.
 *
 * Safety notes:
 *   - INLINE_RE is created fresh per call (no shared mutable /g state)
 *   - parseBlocks is guarded with a hard line-count cap (DoS prevention)
 *   - MarkdownRenderer coalesces updates in a frame-sized interval
 *     during streaming to bound rendering work while keeping formatted output
 */

import { useState, useEffect, useMemo, useRef } from 'react';
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
    | { t: 'link'; v: string; url: string }
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

    const INLINE_RE =
        /(\[[^\]\n]+\]\(https:\/\/[^\s)]+\)|`[^`]+?`|\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g;
    const tokens: InlineToken[] = [];
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = INLINE_RE.exec(text)) !== null) {
        if (m.index > last) {
            tokens.push({ t: 'text', v: text.slice(last, m.index) });
        }
        const raw = m[0];
        if (raw.startsWith('[')) {
            const link = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(raw);
            if (link) {
                tokens.push({ t: 'link', v: link[1], url: link[2] });
            } else {
                tokens.push({ t: 'text', v: raw });
            }
        } else if (raw.startsWith('`')) {
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
            case 'link':
                return (
                    <a key={k} href={tok.url} target="_blank" rel="noopener noreferrer">
                        {tok.v}
                    </a>
                );
            case 'code':
                return (
                    <code key={k} className="md-inline-code">
                        {tok.v}
                    </code>
                );
            case 'bold':
                return <strong key={k}>{tok.v}</strong>;
            case 'italic':
                return <em key={k}>{tok.v}</em>;
            case 'bold_italic':
                return (
                    <strong key={k}>
                        <em>{tok.v}</em>
                    </strong>
                );
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
    | {
          type: 'table';
          headers: string[];
          rows: string[][];
          align: Array<'left' | 'center' | 'right'>;
      }
    | { type: 'quote'; lines: string[] }
    | { type: 'hr' }
    | { type: 'paragraph'; lines: string[] };

function isFenceOpen(line: string): RegExpMatchArray | null {
    return line.match(/^\s*```([\w-]*)\s*$/);
}

function isFenceClose(line: string): boolean {
    return /^\s*```\s*$/.test(line);
}

/** Split table cells while preserving escaped pipes and inline-code pipes. */
function tableCells(line: string): string[] {
    const cells: string[] = [];
    let cell = '';
    let codeTicks = 0;
    const trimmed = line
        .trim()
        .replace(/^\|/, '')
        .replace(/(?<!\\)\|$/, '');
    for (let at = 0; at < trimmed.length; at++) {
        const char = trimmed[at];
        if (char === '\\' && trimmed[at + 1] === '|') {
            cell += '|';
            at++;
        } else if (char === '`') {
            let end = at + 1;
            while (trimmed[end] === '`') end++;
            const count = end - at;
            codeTicks = codeTicks === count ? 0 : codeTicks === 0 ? count : codeTicks;
            cell += trimmed.slice(at, end);
            at = end - 1;
        } else if (char === '|' && !codeTicks) {
            cells.push(cell.trim());
            cell = '';
        } else cell += char;
    }
    cells.push(cell.trim());
    return cells;
}
function tableHeader(
    lines: string[],
    index: number
): { headers: string[]; align: Array<'left' | 'center' | 'right'> } | undefined {
    if (!lines[index]?.includes('|') || !lines[index + 1]?.includes('-')) return undefined;
    const headers = tableCells(lines[index]);
    const separators = tableCells(lines[index + 1]);
    if (
        headers.length > 80 ||
        headers.length !== separators.length ||
        !separators.every((cell) => /^:?-{3,}:?$/.test(cell))
    )
        return undefined;
    return {
        headers,
        align: separators.map((cell) =>
            cell.endsWith(':') ? (cell.startsWith(':') ? 'center' : 'right') : 'left'
        ),
    };
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
            while (i < lines.length && !isFenceClose(lines[i]) && i - codeStart < 500) {
                codeLines.push(lines[i]);
                i++;
            }
            if (i < lines.length && isFenceClose(lines[i])) {
                i++; // consume closing ```
            }
            blocks.push({ type: 'codeblock', lang, lines: codeLines });
            continue;
        }

        const table = tableHeader(lines, i);
        if (table) {
            i += 2;
            const rows: string[][] = [];
            while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
                const cells = tableCells(lines[i++]);
                rows.push(table.headers.map((_, column) => cells[column] ?? ''));
            }
            blocks.push({ type: 'table', ...table, rows });
            continue;
        }
        if (/^\s*>/.test(line)) {
            const quoted: string[] = [];
            while (i < lines.length && /^\s*>/.test(lines[i]))
                quoted.push(lines[i++].replace(/^\s*> ?/, ''));
            blocks.push({ type: 'quote', lines: quoted });
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
            !tableHeader(lines, i) &&
            !/^\s*>/.test(lines[i]) &&
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
    const [visibleContent, setVisibleContent] = useState(content);
    const latestContent = useRef(content);
    latestContent.current = content;
    const scheduled = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    // Parse at most once per frame-sized interval, retaining formatted Markdown while streaming.
    useEffect(() => {
        if (!isStreaming) {
            if (scheduled.current !== undefined) clearTimeout(scheduled.current);
            scheduled.current = undefined;
            setVisibleContent(content);
        } else if (scheduled.current === undefined) {
            scheduled.current = setTimeout(() => {
                scheduled.current = undefined;
                setVisibleContent(latestContent.current);
            }, 16);
        }
    }, [content, isStreaming]);
    useEffect(
        () => () => {
            if (scheduled.current !== undefined) clearTimeout(scheduled.current);
        },
        []
    );
    const blocks = useMemo(() => parseBlocks(visibleContent), [visibleContent]);

    const renderBlock = (block: Block, idx: number) => {
        const keyPfx = `b${idx}`;
        switch (block.type) {
            case 'heading': {
                const cls = `md-h${block.level}`;
                if (block.level === 1) {
                    return (
                        <h1 key={idx} className={cls}>
                            {renderInline(block.text, keyPfx)}
                        </h1>
                    );
                }
                if (block.level === 2) {
                    return (
                        <h2 key={idx} className={cls}>
                            {renderInline(block.text, keyPfx)}
                        </h2>
                    );
                }
                return (
                    <h3 key={idx} className={cls}>
                        {renderInline(block.text, keyPfx)}
                    </h3>
                );
            }
            case 'codeblock': {
                const codeText = block.lines.join('\n');
                const runnableCommand = normalizeStudioRunnableCommand(codeText);
                const displayCodeText = compactStudioPathText(codeText);
                return (
                    <div key={idx} className="md-code-block" dir="ltr">
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
                                        disabled={isStreaming}
                                        onClick={() => onRunCommand(runnableCommand)}
                                        title="Run command"
                                        aria-label="Run command"
                                    >
                                        <Play size={12} />
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <pre className="md-code-pre" dir="ltr">
                            <code>{displayCodeText}</code>
                        </pre>
                    </div>
                );
            }
            case 'table':
                return (
                    <div
                        key={idx}
                        className="md-table-scroll"
                        role="region"
                        aria-label="Response table"
                        tabIndex={0}
                    >
                        <table className="md-table" dir="auto">
                            <thead>
                                <tr>
                                    {block.headers.map((cell, column) => (
                                        <th
                                            key={column}
                                            scope="col"
                                            style={{ textAlign: block.align[column] }}
                                        >
                                            {renderInline(cell, `${keyPfx}-h${column}`)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {block.rows.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {row.map((cell, column) => (
                                            <td
                                                key={column}
                                                style={{ textAlign: block.align[column] }}
                                            >
                                                {renderInline(
                                                    cell,
                                                    `${keyPfx}-${rowIndex}-${column}`
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            case 'quote':
                return (
                    <blockquote key={idx} className="md-quote">
                        {block.lines.map((line, at) => (
                            <div key={at}>{renderInline(line, `${keyPfx}-${at}`)}</div>
                        ))}
                    </blockquote>
                );
            case 'ul':
                return (
                    <ul key={idx} className="md-ul">
                        {block.items.map((item, j) => (
                            <li key={j} className="md-li">
                                {renderInline(item, `${keyPfx}-${j}`)}
                            </li>
                        ))}
                    </ul>
                );
            case 'ol':
                return (
                    <ol key={idx} className="md-ol">
                        {block.items.map((item, j) => (
                            <li key={j} className="md-li">
                                {renderInline(item, `${keyPfx}-${j}`)}
                            </li>
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
                                                    disabled={isStreaming}
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
        <div className={`md-body${isStreaming ? ' md-streaming' : ''}`} dir="auto">
            {blocks.map(renderBlock)}
            {isStreaming && (
                <span className="ai-modal-cursor" aria-hidden="true">
                    ▍
                </span>
            )}
        </div>
    );
}
