import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Terminal } from 'lucide-react';
import { COMMAND_CHEATSHEET_GROUPS } from '@/lib/commandCheatsheet';
import { ColumnHeader } from './SectionHeader';

interface CommandCheatsheetProps {
  onCopyText?: (text: string) => void;
}

export function CommandCheatsheet({ onCopyText }: CommandCheatsheetProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyCommand = (command: string) => {
    onCopyText?.(command);
    setCopiedCommand(command);
    window.setTimeout(() => setCopiedCommand(null), 1800);
  };

  return (
    <section className="command-cheatsheet section">
      <div className="command-cheatsheet__head">
        <ColumnHeader
          title="CLI reference"
          subtitle="Portable npx commands mapped to dashboard actions"
          scope="catalog"
        />
        <button
          type="button"
          className="command-cheatsheet__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded ? (
        <div className="command-cheatsheet__groups">
          {COMMAND_CHEATSHEET_GROUPS.map((group) => (
            <div key={group.id} className="command-cheatsheet__group">
              <h4>{group.title}</h4>
              <ul>
                {group.entries.map((entry) => (
                  <li key={`${group.id}-${entry.label}`}>
                    <span className="command-cheatsheet__label">
                      <Terminal size={11} aria-hidden="true" />
                      {entry.label}
                    </span>
                    <code>{entry.command}</code>
                    {entry.note ? (
                      <small className="command-cheatsheet__note">{entry.note}</small>
                    ) : null}
                    <button
                      type="button"
                      className="command-cheatsheet__copy"
                      onClick={() => copyCommand(entry.command)}
                      title="Copy command"
                      aria-label={`Copy ${entry.label} command`}
                    >
                      {copiedCommand === entry.command ? (
                        'Copied'
                      ) : (
                        <Copy size={12} aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="command-cheatsheet__hint">
          Expand for workspace, project, and module command equivalents used by the dashboard.
        </p>
      )}
    </section>
  );
}
