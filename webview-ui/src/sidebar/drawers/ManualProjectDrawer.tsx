import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, MapPin, Package } from 'lucide-react';
import { Drawer } from '../drawer/Drawer';
import { FRAMEWORK_OPTIONS } from '../createTypes';
import type { SidebarScope } from '../sidebarTypes';

const BACKEND_KEYS = [
  'fastapi-standard',
  'fastapi-ddd',
  'nestjs-standard',
  'springboot-standard',
  'gofiber-standard',
  'gogin-standard',
  'dotnet-webapi-clean',
  'rust-axum',
  'php-laravel',
];

const DESKTOP_KEYS = ['desktop-tauri', 'desktop-electron'];

const EXTENSION_KEYS = ['vscode-extension'];

const FRONTEND_KEYS = [
  'nextjs',
  'react-router',
  'vite-react',
  'vite-vue',
  'vite-svelte',
  'vite-solid',
  'vite-vanilla',
  'nuxt',
  'angular',
  'astro',
  'sveltekit',
];

function shortLabel(key: string): string {
  return (
    FRAMEWORK_OPTIONS.find((o) => o.value === key)
      ?.label.replace(/ Kit$/, '')
      .replace(/ Standard/, '') ?? key
  );
}

interface ManualProjectDrawerProps {
  open: boolean;
  busy: boolean;
  scope: SidebarScope;
  onClose: () => void;
  onCreate: (input: { name: string; framework: string }) => void;
}

export function ManualProjectDrawer({
  open,
  busy,
  scope,
  onClose,
  onCreate,
}: ManualProjectDrawerProps) {
  const [framework, setFramework] = useState('fastapi-standard');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const placeholder = useMemo(() => {
    if (framework.includes('next') || framework.includes('vite') || framework.includes('react')) {
      return 'my-web-app';
    }
    return 'my-api-service';
  }, [framework]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFramework('fastapi-standard');
    setName('');
    setError('');
  }, [open]);

  const validate = (value: string): boolean => {
    if (!value.trim()) {
      setError('Project name is required');
      return false;
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(value)) {
      setError('Start with a lowercase letter; use lowercase letters, numbers, - or _');
      return false;
    }
    if (value.length < 2 || value.length > 214) {
      setError('Use between 2 and 214 characters');
      return false;
    }
    if (
      ['test', 'tests', 'src', 'dist', 'build', 'lib', 'python', 'pip', 'poetry', 'node', 'npm', 'rapidkit'].includes(
        value
      )
    ) {
      setError('This name is reserved; choose a different project name');
      return false;
    }
    setError('');
    return true;
  };

  const submit = () => {
    if (!validate(name) || busy) {
      return;
    }
    onCreate({ name: name.trim(), framework });
  };

  const renderFrameworkRow = (title: string, keys: string[]) => (
    <section key={title} className="ws-drawer-section ws-drawer-section--flush">
      <span className="ws-drawer-section__label">{title}</span>
      <div className="ws-drawer-chip-grid ws-drawer-chip-grid--framework">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            className={`ws-drawer-chip${framework === key ? ' is-selected' : ''}`}
            onClick={() => setFramework(key)}
          >
            {shortLabel(key)}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <Drawer
      open={open}
      sizing="auto"
      title="Create Project"
      subtitle="Pick a kit and name the project."
      icon={<Package size={14} aria-hidden={true} />}
      onClose={onClose}
      footer={
        <div className="ws-drawer__foot-actions">
          <button type="button" className="ws-drawer__secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ws-drawer__primary"
            disabled={busy || !name.trim() || Boolean(error)}
            onClick={submit}
          >
            Create Project
          </button>
        </div>
      }
    >
      <section className="ws-drawer-section ws-drawer-section--flush">
        <span className="ws-drawer-section__label">Target workspace</span>
        <div className="ws-drawer-scope ws-drawer-scope--compact">
          <span
            className="ws-drawer-target-badge"
            data-default={scope.workspaceName ? 'false' : 'true'}
            title={scope.workspacePath || undefined}
          >
            <MapPin size={11} strokeWidth={2} aria-hidden={true} />
            <strong>{scope.workspaceName || 'Default Workspai location'}</strong>
          </span>
        </div>
      </section>

      {renderFrameworkRow('Backend', BACKEND_KEYS)}
      {renderFrameworkRow('Frontend', FRONTEND_KEYS)}
      {renderFrameworkRow('Desktop', DESKTOP_KEYS)}
      {renderFrameworkRow('Extension', EXTENSION_KEYS)}

      <section className="ws-drawer-section">
        <label className="ws-drawer-field">
          <span className="ws-drawer-section__label">Project name</span>
          <input
            className="ws-drawer-input"
            value={name}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value) {
                validate(e.target.value);
              } else {
                setError('');
              }
            }}
          />
          {error ? (
            <span className="ws-drawer-error">
              <AlertCircle size={11} aria-hidden={true} /> {error}
            </span>
          ) : null}
        </label>
      </section>
    </Drawer>
  );
}
