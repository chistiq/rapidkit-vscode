import type { SidebarStudioDiffLineView } from '@/lib/sidebarStudioActionProgress';

type StudioDiffViewProps = {
  lines: SidebarStudioDiffLineView[];
  label: string;
};

function marker(type: SidebarStudioDiffLineView['type']): string {
  if (type === 'added') {
    return '+';
  }
  if (type === 'removed') {
    return '-';
  }
  return ' ';
}

/**
 * Render bounded repair hunks as a gutter diff.
 *
 * A removed line shows its original line number, an added line shows its new
 * line number, and context shows the new numbering so the block reads like the
 * file it will become. Truncation rows carry no number because they stand in
 * for a range rather than a single line.
 */
export function StudioDiffView({ lines, label }: StudioDiffViewProps) {
  return (
    <div className="ws-sidebar__studio-diff" role="group" aria-label={label}>
      {lines.map((line, index) => {
        const lineNumber = line.type === 'removed' ? line.beforeLine : line.afterLine;
        return (
          <div
            key={`${line.type}-${index}-${lineNumber ?? 'x'}`}
            className="ws-sidebar__studio-diff-row"
            data-type={line.type}
          >
            <span className="ws-sidebar__studio-diff-gutter" aria-hidden="true">
              {lineNumber ?? ''}
            </span>
            <span className="ws-sidebar__studio-diff-marker" aria-hidden="true">
              {marker(line.type)}
            </span>
            <code className="ws-sidebar__studio-diff-code">{line.content}</code>
          </div>
        );
      })}
    </div>
  );
}
