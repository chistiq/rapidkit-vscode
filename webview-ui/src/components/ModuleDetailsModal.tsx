import { useState } from 'react';
import type { ModuleData } from '@/types';
import {
  Package,
  Settings,
  Layers,
  Sparkles,
  BookOpen,
  Download,
  Link2,
  CheckCircle2,
  Tag,
  Database,
  Zap,
  Lock,
  Eye,
  Shield,
  FileText,
  CreditCard,
  MessageSquare,
  Users,
  Calendar,
  Brain,
} from 'lucide-react';
import { EnterpriseModal } from './EnterpriseModal';
import { buildRapidkitDisplayCommand } from '../lib/rapidkitCommandText';

type TabType = 'overview' | 'dependencies' | 'configuration' | 'profiles' | 'features' | 'docs';

interface ModuleDetailsModalProps {
  module: ModuleData | null;
  onClose: () => void;
}

// Icon mapping based on category (same as ModuleBrowser)
const categoryIcons: Record<string, any> = {
  ai: Brain,
  database: Database,
  cache: Zap,
  auth: Lock,
  observability: Eye,
  security: Shield,
  essentials: FileText,
  billing: CreditCard,
  communication: MessageSquare,
  users: Users,
  tasks: Calendar,
  business: Package,
};

export function ModuleDetailsModal({ module, onClose }: ModuleDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  if (!module) {
    return null;
  }

  const IconComponent = categoryIcons[module.category] || Package;

  return (
    <EnterpriseModal
      isOpen={Boolean(module)}
      title={module.display_name || module.name}
      subtitle={
        module.description ||
        'Module manifest, dependencies, configuration, features, and documentation.'
      }
      kicker="Module details"
      scope={`v${module.version || 'N/A'} · ${module.category}`}
      icon={<IconComponent size={16} />}
      size="xl"
      onClose={onClose}
    >
      <div className="modal-chip-row" style={{ marginTop: -4, marginBottom: 12 }}>
        <span
          className={`modal-chip ${module.status && module.status !== 'stable' ? 'modal-chip--warning' : ''}`}
        >
          {module.status || 'stable'}
        </span>
        <span className="modal-chip modal-chip--mono">{module.slug}</span>
      </div>

      {/* Tabs */}
      <div className="module-details-tabs">
        {[
          { id: 'overview', label: 'Overview', icon: Package },
          { id: 'dependencies', label: 'Dependencies', icon: Link2 },
          { id: 'configuration', label: 'Configuration', icon: Settings },
          { id: 'profiles', label: 'Profiles', icon: Layers },
          { id: 'features', label: 'Features', icon: Sparkles },
          { id: 'docs', label: 'Documentation', icon: BookOpen },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`module-details-tab ${
                activeTab === tab.id ? 'module-details-tab--active' : ''
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="module-details-content">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <section>
              <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">Description</h3>
              <p className="text-[var(--vscode-foreground)] leading-relaxed">
                {module.description || 'No description available'}
              </p>
            </section>

            {module.tags && module.tags.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)] flex items-center gap-2">
                  <Tag size={18} />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {module.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 text-sm rounded-full bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {module.capabilities && module.capabilities.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Capabilities
                </h3>
                <ul className="space-y-2">
                  {module.capabilities.map((cap, i) => (
                    <li key={i} className="flex items-start gap-2 text-[var(--vscode-foreground)]">
                      <CheckCircle2 size={16} className="text-green-500 mt-1 flex-shrink-0" />
                      <span>{cap}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)] flex items-center gap-2">
                <Download size={18} />
                Installation
              </h3>
              <div className="bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded-lg p-4">
                <code className="text-sm text-[var(--vscode-foreground)] font-mono">
                  {buildRapidkitDisplayCommand(['add', 'module', module.slug])}
                </code>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'dependencies' && (
          <div className="space-y-6">
            {module.module_dependencies && module.module_dependencies.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Module Dependencies
                </h3>
                <div className="flex flex-wrap gap-2">
                  {module.module_dependencies.map((dep, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 text-sm rounded-lg bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] font-mono"
                    >
                      {dep}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {module.runtime_dependencies && Object.keys(module.runtime_dependencies).length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Runtime Dependencies
                </h3>
                <div className="space-y-4">
                  {Object.entries(module.runtime_dependencies).map(([profile, deps]) => (
                    <div
                      key={profile}
                      className="border border-[var(--vscode-panel-border)] rounded-lg p-4 bg-[var(--vscode-textCodeBlock-background)]"
                    >
                      <div className="font-semibold text-[var(--ws-primary)] mb-3">{profile}</div>
                      <div className="space-y-2">
                        {deps.map((dep, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm">
                            <span className="font-mono text-[var(--vscode-foreground)]">
                              {dep.name}
                            </span>
                            <span className="text-[var(--vscode-descriptionForeground)]">
                              {dep.version}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]">
                              {dep.tool}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!module.module_dependencies?.length && !module.runtime_dependencies && (
              <div className="text-center py-12 text-[var(--vscode-descriptionForeground)]">
                <Package size={48} className="mx-auto mb-3 opacity-30" />
                <p>No dependencies</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'configuration' && (
          <div className="space-y-6">
            {module.config_sources && module.config_sources.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Configuration Sources
                </h3>
                <div className="flex flex-wrap gap-2">
                  {module.config_sources.map((source, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 text-sm rounded-lg bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] font-mono"
                    >
                      {source}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {module.defaults && Object.keys(module.defaults).length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Default Configuration
                </h3>
                <div className="border border-[var(--vscode-panel-border)] rounded-lg p-4 bg-[var(--vscode-textCodeBlock-background)]">
                  <pre className="text-xs text-[var(--vscode-foreground)] overflow-x-auto">
                    {JSON.stringify(module.defaults, null, 2)}
                  </pre>
                </div>
              </section>
            )}

            {module.variables && module.variables.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Environment Variables
                </h3>
                <div className="space-y-4">
                  {module.variables.map((variable, i) => (
                    <div
                      key={i}
                      className="border border-[var(--vscode-panel-border)] rounded-lg p-4 bg-[var(--vscode-textCodeBlock-background)]"
                    >
                      <div className="font-mono text-sm font-semibold text-[var(--ws-primary)] mb-2">
                        {variable.key}
                      </div>
                      <div className="text-xs text-[var(--vscode-descriptionForeground)] mb-2">
                        <span className="font-semibold">Type:</span> {variable.type} {' | '}
                        <span className="font-semibold">Default:</span>{' '}
                        {variable.default !== null && variable.default !== undefined
                          ? JSON.stringify(variable.default)
                          : 'None'}
                      </div>
                      <p className="text-sm text-[var(--vscode-foreground)]">
                        {variable.description || 'No description'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {!module.config_sources?.length && !module.defaults && !module.variables?.length && (
              <div className="text-center py-12 text-[var(--vscode-descriptionForeground)]">
                <Settings size={48} className="mx-auto mb-3 opacity-30" />
                <p>No configuration available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'profiles' && (
          <div className="space-y-6">
            {module.profiles && Object.keys(module.profiles).length > 0 ? (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Installation Profiles
                </h3>
                <div className="space-y-3">
                  {Object.entries(module.profiles).map(([key, value]) => (
                    <div
                      key={key}
                      className="border border-[var(--vscode-panel-border)] rounded-lg p-4 bg-[var(--vscode-textCodeBlock-background)]"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-[var(--ws-primary)]">{key}</span>
                        {value.inherits && (
                          <span className="text-xs px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]">
                            inherits: {value.inherits}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--vscode-foreground)]">
                        {value.description || 'No description'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <div className="text-center py-12 text-[var(--vscode-descriptionForeground)]">
                <Layers size={48} className="mx-auto mb-3 opacity-30" />
                <p>No profiles available</p>
              </div>
            )}

            {module.compatibility && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Compatibility
                </h3>
                <div className="space-y-3 border border-[var(--vscode-panel-border)] rounded-lg p-4 bg-[var(--vscode-textCodeBlock-background)]">
                  {module.compatibility.python && (
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-[var(--vscode-descriptionForeground)] min-w-[80px]">
                        Python:
                      </span>
                      <span className="font-mono text-sm text-[var(--vscode-foreground)]">
                        {module.compatibility.python}
                      </span>
                    </div>
                  )}
                  {module.compatibility.node && (
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-[var(--vscode-descriptionForeground)] min-w-[80px]">
                        Node.js:
                      </span>
                      <span className="font-mono text-sm text-[var(--vscode-foreground)]">
                        {module.compatibility.node}
                      </span>
                    </div>
                  )}
                  {module.compatibility.frameworks &&
                    module.compatibility.frameworks.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-[var(--vscode-descriptionForeground)] min-w-[80px]">
                          Frameworks:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {module.compatibility.frameworks.map((fw, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 text-xs rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]"
                            >
                              {fw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  {module.compatibility.os && module.compatibility.os.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-[var(--vscode-descriptionForeground)] min-w-[80px]">
                        OS:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {module.compatibility.os.map((os, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 text-xs rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]"
                          >
                            {os}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-6">
            {module.features &&
            (Array.isArray(module.features)
              ? module.features.length > 0
              : Object.keys(module.features).length > 0) ? (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Module Features
                </h3>
                <ul className="space-y-3">
                  {Array.isArray(module.features)
                    ? module.features.map((feature, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-[var(--vscode-foreground)]"
                        >
                          <CheckCircle2 size={16} className="text-green-500 mt-1 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))
                    : Object.entries(module.features).map(([key, value]) => (
                        <li
                          key={key}
                          className="border border-[var(--vscode-panel-border)] rounded-lg p-4 bg-[var(--vscode-textCodeBlock-background)]"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2
                              size={16}
                              className={value.enabled ? 'text-green-500' : 'text-gray-500'}
                            />
                            <span className="font-semibold text-[var(--ws-primary)]">{key}</span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                value.status === 'stable'
                                  ? 'bg-green-600 text-white'
                                  : value.status === 'beta'
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-gray-600 text-white'
                              }`}
                            >
                              {value.status}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--vscode-foreground)] mb-3">
                            {value.description}
                          </p>
                          {value.files && value.files.length > 0 && (
                            <div className="ml-6 space-y-1">
                              <div className="text-xs font-semibold text-[var(--vscode-descriptionForeground)] mb-1">
                                Files:
                              </div>
                              {value.files.map((file, i) => (
                                <div key={i} className="text-xs space-y-0.5">
                                  <div className="font-mono text-[var(--ws-primary)]">
                                    {file.path}
                                  </div>
                                  <div className="text-[var(--vscode-descriptionForeground)] ml-2">
                                    {file.description}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                </ul>
              </section>
            ) : (
              <div className="text-center py-12 text-[var(--vscode-descriptionForeground)]">
                <Sparkles size={48} className="mx-auto mb-3 opacity-30" />
                <p>No features information</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="space-y-6">
            {module.documentation && (
              <>
                {module.documentation.readme && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">README</h3>
                    <div className="text-sm text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded px-3 py-2">
                      {module.documentation.readme}
                    </div>
                  </section>
                )}

                {module.documentation.overview && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                      Overview
                    </h3>
                    <div className="text-sm text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded px-3 py-2">
                      {module.documentation.overview}
                    </div>
                  </section>
                )}

                {module.documentation.usage && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                      Usage Guide
                    </h3>
                    <div className="text-sm text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded px-3 py-2">
                      {module.documentation.usage}
                    </div>
                  </section>
                )}

                {module.documentation.advanced && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                      Advanced
                    </h3>
                    <div className="text-sm text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded px-3 py-2">
                      {module.documentation.advanced}
                    </div>
                  </section>
                )}

                {module.documentation.api_docs && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                      API Reference
                    </h3>
                    <div className="text-sm text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded px-3 py-2">
                      {module.documentation.api_docs}
                    </div>
                  </section>
                )}

                {module.documentation.migration && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                      Migration Guide
                    </h3>
                    <div className="text-sm text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded px-3 py-2">
                      {module.documentation.migration}
                    </div>
                  </section>
                )}

                {module.documentation.troubleshooting && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                      Troubleshooting
                    </h3>
                    <div className="text-sm text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded px-3 py-2">
                      {module.documentation.troubleshooting}
                    </div>
                  </section>
                )}

                {module.documentation.changelog && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                      Changelog
                    </h3>
                    <div className="text-sm text-[var(--vscode-foreground)] font-mono bg-[var(--vscode-textCodeBlock-background)] border border-[var(--vscode-panel-border)] rounded px-3 py-2">
                      {module.documentation.changelog}
                    </div>
                  </section>
                )}

                {module.documentation.quick_guide && (
                  <section>
                    <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                      Quick Start
                    </h3>
                    <p className="text-[var(--vscode-foreground)] leading-relaxed whitespace-pre-wrap">
                      {module.documentation.quick_guide}
                    </p>
                  </section>
                )}

                {module.documentation.links &&
                  Object.keys(module.documentation.links).length > 0 && (
                    <section>
                      <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">Links</h3>
                      <ul className="space-y-2">
                        {Object.entries(module.documentation.links).map(([key, url]) => (
                          <li key={key}>
                            <a
                              href={url}
                              className="flex items-center gap-2 text-[var(--vscode-textLink-foreground)] hover:underline"
                            >
                              <Link2 size={14} />
                              {key}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
              </>
            )}

            {module.changelog && module.changelog.length > 0 && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">
                  Version History
                </h3>
                <div className="space-y-2">
                  {module.changelog.map((entry, i) => (
                    <div
                      key={i}
                      className="border border-[var(--vscode-panel-border)] rounded-lg p-3 bg-[var(--vscode-textCodeBlock-background)]"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-semibold text-[var(--ws-primary)]">
                          v{entry.version}
                        </span>
                        <span className="text-xs text-[var(--vscode-descriptionForeground)]">
                          {entry.date}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--vscode-foreground)]">{entry.notes}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {module.support && (
              <section>
                <h3 className="text-lg font-semibold mb-3 text-[var(--ws-primary)]">Support</h3>
                <ul className="space-y-2">
                  {module.support.issues && (
                    <li>
                      <a
                        href={module.support.issues}
                        className="flex items-center gap-2 text-[var(--vscode-textLink-foreground)] hover:underline"
                      >
                        <Link2 size={14} />
                        Issues
                      </a>
                    </li>
                  )}
                  {module.support.discussions && (
                    <li>
                      <a
                        href={module.support.discussions}
                        className="flex items-center gap-2 text-[var(--vscode-textLink-foreground)] hover:underline"
                      >
                        <Link2 size={14} />
                        Discussions
                      </a>
                    </li>
                  )}
                  {module.support.documentation && (
                    <li>
                      <a
                        href={module.support.documentation}
                        className="flex items-center gap-2 text-[var(--vscode-textLink-foreground)] hover:underline"
                      >
                        <Link2 size={14} />
                        Documentation
                      </a>
                    </li>
                  )}
                </ul>
              </section>
            )}

            {!module.documentation && !module.changelog && !module.support && (
              <div className="text-center py-12 text-[var(--vscode-descriptionForeground)]">
                <BookOpen size={48} className="mx-auto mb-3 opacity-30" />
                <p>No documentation available</p>
              </div>
            )}
          </div>
        )}
      </div>
    </EnterpriseModal>
  );
}
