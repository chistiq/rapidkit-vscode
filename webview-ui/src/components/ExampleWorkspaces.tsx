import {
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  Server,
  ChevronDown,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ExampleWorkspace } from '@/types';
import { vscode } from '@/vscode';
import { SectionHeader } from './SectionHeader';

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

type FrameworkFilter = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';

const PROFILE_FRAMEWORK_FILTER: Readonly<Record<string, FrameworkFilter>> = {
  'python-only': 'fastapi',
  'node-only': 'nestjs',
  'go-only': 'go',
  'java-only': 'springboot',
  'dotnet-only': 'dotnet',
};

function exampleMatchesFramework(example: ExampleWorkspace, framework: FrameworkFilter): boolean {
  return (
    example.projects.some((project) => project.type === framework) ||
    (example.profile ? PROFILE_FRAMEWORK_FILTER[example.profile] === framework : false)
  );
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
    'all' | 'profiles' | 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet'
  >('all');
  const [readiness, setReadiness] = useState<'all' | 'cloned' | 'updates' | 'available'>('all');

  const frameworkCounts = useMemo(() => {
    const counts: Record<string, number> = { all: examples.length, profiles: 0 };
    for (const item of ['fastapi', 'nestjs', 'go', 'springboot', 'dotnet'] as const) {
      counts[item] = examples.filter((example) => exampleMatchesFramework(example, item)).length;
    }
    counts.profiles = examples.filter(
      (example) => example.catalogKind === 'profile-foundation'
    ).length;
    return counts;
  }, [examples]);

  const filteredExamples = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return examples.filter((example) => {
      const cloneStatus = example.cloneStatus || 'not-cloned';
      const matchesFramework =
        framework === 'all' ||
        (framework === 'profiles'
          ? example.catalogKind === 'profile-foundation'
          : exampleMatchesFramework(example, framework));
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
    return (
      <div className="section">
        <SectionHeader
          icon={<GitBranch className="w-6 h-6" />}
          title="Workspace Templates"
          scope="catalog"
          count="0"
        />
        <div className="template-empty-state">
          No workspace templates are available yet. Refresh the dashboard or check your network
          connection.
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <SectionHeader
        icon={<GitBranch className="w-6 h-6" />}
        title="Workspace Templates"
        scope="catalog"
        count={`${filteredExamples.length}/${examples.length}`}
      />

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
        <div className="template-filter-group" aria-label="Runtime or framework filter">
          {(['all', 'profiles', 'fastapi', 'nestjs', 'go', 'springboot', 'dotnet'] as const).map(
            (item) => (
              <button
                key={item}
                type="button"
                className={`ws-chip ${framework === item ? 'is-active' : ''}`}
                onClick={() => {
                  setFramework(item);
                  setShowAll(false);
                }}
              >
                {item === 'all'
                  ? 'All'
                  : item === 'profiles'
                    ? 'Profiles'
                    : item === 'springboot'
                      ? 'Spring Boot'
                      : item === 'dotnet'
                        ? '.NET'
                        : item}
                <span>{frameworkCounts[item] || 0}</span>
              </button>
            )
          )}
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
              className={`ws-chip ${readiness === value ? 'is-active' : ''}`}
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
            <div key={example.name} className="ws-card example-card">
              <div className="example-header">
                <div className="example-info">
                  <div className="example-title">
                    {example.title}
                    {example.tags && example.tags.length > 0 && (
                      <div className="example-tags">
                        {example.tags.map((tag, idx) => (
                          <span key={idx} className="ws-chip ws-chip--muted example-tag">
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
                    className="ws-btn ws-btn--ghost ws-btn--icon example-btn example-btn--secondary"
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
                      className="ws-btn ws-btn--warn example-btn example-btn--warning"
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
                      className={`ws-btn example-btn ${isCloned ? 'is-installed example-btn--success' : 'ws-btn--primary example-btn--primary'}`}
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
                {example.projects.length > 0 ? (
                  <button
                    className="example-projects-toggle"
                    onClick={() => setExpandedExample(isExpanded ? null : example.name)}
                  >
                    <span className="example-projects-count">
                      {example.projects.length}{' '}
                      {example.projects.length === 1 ? 'project' : 'projects'}
                    </span>
                    <span className={`example-chevron ${isExpanded ? 'expanded' : ''}`}>
                      <ChevronDown size={12} aria-hidden="true" />
                    </span>
                  </button>
                ) : (
                  <div className="example-projects-toggle" aria-label="Workspace foundation">
                    <span className="example-projects-count">
                      {example.profile ? `${example.profile} profile` : 'Workspace foundation'}
                    </span>
                  </div>
                )}
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
          <button
            type="button"
            className="ws-btn ws-btn--ghost"
            onClick={() => setShowAll((value) => !value)}
          >
            {showAll ? 'Show less' : `Show ${hiddenCount} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
