import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, MapPin, Package } from 'lucide-react';
import { Drawer } from '../drawer/Drawer';
import {
  CREATE_KIT_OPTIONS,
  type CreateKitCategory,
  type ManualProjectInput,
} from '../createTypes';
import type { SidebarScope } from '../sidebarTypes';

const CATEGORY_ROWS: Array<{ id: CreateKitCategory; label: string }> = [
  { id: 'backend', label: 'Backend' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'agent', label: 'AI Agent' },
  { id: 'gateway', label: 'AI Gateway' },
  { id: 'extension', label: 'Extension' },
];

interface ManualProjectDrawerProps {
  open: boolean;
  busy: boolean;
  scope: SidebarScope;
  onClose: () => void;
  onCreate: (input: Omit<ManualProjectInput, 'mode'>) => void;
}

export function ManualProjectDrawer({
  open,
  busy,
  scope,
  onClose,
  onCreate,
}: ManualProjectDrawerProps) {
  const [kit, setKit] = useState('fastapi.standard');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const placeholder = useMemo(() => {
    const selected = CREATE_KIT_OPTIONS.find((option) => option.value === kit);
    if (selected?.category === 'frontend') {
      return 'my-web-app';
    }
    if (selected?.category === 'agent') {
      return 'my-agent';
    }
    if (selected?.category === 'gateway') {
      return 'my-gateway';
    }
    return selected?.category === 'desktop' ? 'my-desktop-app' : 'my-api-service';
  }, [kit]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setKit('fastapi.standard');
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
      [
        'test',
        'tests',
        'src',
        'dist',
        'build',
        'lib',
        'python',
        'pip',
        'poetry',
        'node',
        'npm',
        'rapidkit',
      ].includes(value)
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
    const selected = CREATE_KIT_OPTIONS.find((option) => option.value === kit);
    if (!selected) {
      setError('Select a supported project kit');
      return;
    }
    onCreate({ name: name.trim(), framework: selected.framework, kit: selected.value });
  };

  const renderFrameworkRow = (category: CreateKitCategory, title: string) => (
    <section key={title} className="ws-drawer-section ws-drawer-section--flush">
      <span className="ws-drawer-section__label">{title}</span>
      <div className="ws-drawer-chip-grid ws-drawer-chip-grid--framework">
        {CREATE_KIT_OPTIONS.filter((option) => option.category === category).map((option) => (
          <button
            key={option.value}
            type="button"
            className={`ws-drawer-chip${kit === option.value ? ' is-selected' : ''}`}
            onClick={() => setKit(option.value)}
            title={`${option.label} · ${option.runtime}`}
          >
            {option.label}
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

      {CATEGORY_ROWS.map((category) => renderFrameworkRow(category.id, category.label))}

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
