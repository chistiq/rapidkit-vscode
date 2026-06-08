import {
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  Server,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ExampleWorkspace } from '@/types';
import { vscode } from '@/vscode';

export interface ExampleProject {
  name: string;
  type: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';
  description: string;
}

interface ExampleWorkspacesProps {
  examples: ExampleWorkspace[];
  onClone: (example: ExampleWorkspace) => void;
  onUpdate?: (example: ExampleWorkspace) => void;
  cloningExample?: string | null;
  updatingExample?: string | null;
}

const getProjectTypeLabel = (
  type: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet'
): string => {
  if (type === 'fastapi') {
    return 'API';
  }
  if (type === 'nestjs') {
    return 'NJS';
  }
  if (type === 'go') {
    return 'GO';
  }
  if (type === 'dotnet') {
    return '.NET';
  }
  return 'JVM';
};

export function ExampleWorkspaces({
  examples,
  onClone,
  onUpdate,
  cloningExample,
  updatingExample,
}: ExampleWorkspacesProps) {
  const [expandedExample, setExpandedExample] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [framework, setFramework] = useState<
    'all' | 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet'
  >('all');
  const [readiness, setReadiness] = useState<'all' | 'cloned' | 'updates' | 'available'>('all');

  const frameworkCounts = useMemo(() => {
    const counts: Record<string, number> = { all: examples.length };
    for (const example of examples) {
      for (const project of example.projects) {
        counts[project.type] = (counts[project.type] || 0) + 1;
      }
    }
    return counts;
  }, [examples]);

  const filteredExamples = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return examples.filter((example) => {
      const cloneStatus = example.cloneStatus || 'not-cloned';
      const matchesFramework =
        framework === 'all' || example.projects.some((project) => project.type === framework);
      const matchesReadiness =
        readiness === 'all' ||
        (readiness === 'cloned' && cloneStatus === 'cloned') ||
        (readiness === 'updates' && cloneStatus === 'update-available') ||
        (readiness === 'available' && cloneStatus === 'not-cloned');
      const searchable = [
        example.title,
        example.name,
        example.description,
        ...(example.tags || []),
        ...example.projects.flatMap((project) => [project.name, project.type, project.description]),
      ]
        .join(' ')
        .toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      return matchesFramework && matchesReadiness && matchesQuery;
    });
  }, [examples, framework, query, readiness]);

  const visibleExamples = showAll ? filteredExamples : filteredExamples.slice(0, 8);
  const hiddenCount = filteredExamples.length - visibleExamples.length;

  if (examples.length === 0) {
    return null;
  }

  return (
    <div className="section">
      <div className="section-title">
        <GitBranch className="w-6 h-6" />
        Workspace Templates
        <span className="section-count">
          {filteredExamples.length}/{examples.length}
        </span>
      </div>

      <div className="template-catalog-toolbar">
        <label className="template-search">
          <Search size={13} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowAll(false);
            }}
            placeholder="Search templates, frameworks, tags..."
          />
        </label>
        <div className="template-filter-group" aria-label="Framework filter">
          {(['all', 'fastapi', 'nestjs', 'go', 'springboot', 'dotnet'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={framework === item ? 'is-active' : ''}
              onClick={() => {
                setFramework(item);
                setShowAll(false);
              }}
            >
              {item === 'all' ? 'All' : item}
              <span>{frameworkCounts[item] || 0}</span>
            </button>
          ))}
        </div>
        <div className="template-filter-group" aria-label="Clone status filter">
          {[
            ['all', 'All'],
            ['available', 'Available'],
            ['cloned', 'Cloned'],
            ['updates', 'Updates'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={readiness === value ? 'is-active' : ''}
              onClick={() => {
                setReadiness(value as typeof readiness);
                setShowAll(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="example-workspace-grid">
        {visibleExamples.length === 0 ? (
          <div className="template-empty-state">No templates match the current filters.</div>
        ) : null}
        {visibleExamples.map((example) => {
          const isCloning = cloningExample === example.name;
          const isUpdating = updatingExample === example.name;
          const isExpanded = expandedExample === example.name;
          const cloneStatus = example.cloneStatus || 'not-cloned';
          const isCloned = cloneStatus === 'cloned' || cloneStatus === 'update-available';
          const hasUpdate = cloneStatus === 'update-available';

          return (
            <div key={example.name} className="example-card">
              <div className="example-header">
                <div className="example-info">
                  <div className="example-title">
                    {example.title}
                    {example.tags && example.tags.length > 0 && (
                      <div className="example-tags">
                        {example.tags.map((tag, idx) => (
                          <span key={idx} className="example-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="example-description">{example.description}</div>
                </div>
                <div className="example-actions">
                  <button
                    className="example-btn example-btn--secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      vscode.postMessage('openUrl', { url: example.repoUrl });
                    }}
                    title="View on GitHub"
                    disabled={isCloning || isUpdating}
                  >
                    <ExternalLink size={14} />
                  </button>

                  {hasUpdate && onUpdate ? (
                    <button
                      className="example-btn example-btn--warning"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdate(example);
                      }}
                      disabled={isUpdating || isCloning}
                      title="Update to latest version"
                    >
                      {isUpdating ? (
                        <>
                          <Loader2 size={14} className="spinning" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={14} />
                          Update
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      className={`example-btn ${isCloned ? 'example-btn--success' : 'example-btn--primary'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isCloned) {
                          onClone(example);
                        }
                      }}
                      disabled={isCloning || isUpdating || isCloned}
                      title={isCloned ? 'Already cloned' : 'Clone and Import'}
                    >
                      {isCloning ? (
                        <>
                          <Loader2 size={14} className="spinning" />
                          Cloning...
                        </>
                      ) : isCloned ? (
                        <>
                          <CheckCircle2 size={14} />
                          Cloned
                        </>
                      ) : (
                        <>
                          <Download size={14} />
                          Clone
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Projects list - collapsible */}
              <div className="example-projects">
                <button
                  className="example-projects-toggle"
                  onClick={() => setExpandedExample(isExpanded ? null : example.name)}
                >
                  <span className="example-projects-count">
                    {example.projects.length}{' '}
                    {example.projects.length === 1 ? 'project' : 'projects'}
                  </span>
                  <span className={`example-chevron ${isExpanded ? 'expanded' : ''}`}>▼</span>
                </button>
                {isExpanded && (
                  <div className="example-projects-list">
                    {example.projects.map((project, idx) => (
                      <div key={idx} className="example-project">
                        <span className="example-project-emoji">
                          <Server size={13} />
                        </span>
                        <div className="example-project-info">
                          <div className="example-project-name">{project.name}</div>
                          <div className="example-project-desc">{project.description}</div>
                        </div>
                        <span className="example-project-type">
                          {getProjectTypeLabel(project.type)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="example-footer">
        <span>
          Showing {visibleExamples.length} of {filteredExamples.length} matching templates.
        </span>
        {hiddenCount > 0 || showAll ? (
          <button type="button" onClick={() => setShowAll((value) => !value)}>
            {showAll ? 'Show less' : `Show ${hiddenCount} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
