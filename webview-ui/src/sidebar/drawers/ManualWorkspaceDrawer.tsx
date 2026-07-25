import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, FolderPlus, Sparkles } from 'lucide-react';
import { Drawer } from '../drawer/Drawer';
import {
  MANUAL_STACK_LANES,
  defaultInstallPythonEngineForProfile,
  defaultProfileForStackLane,
  recommendedProfilesForStackLane,
  resolveDefaultWorkspaceName,
  stackLaneGuidance,
  type CreationStackLane,
} from '@/lib/creationPresets';

export type WorkspaceProfile =
  | 'minimal'
  | 'python-only'
  | 'node-only'
  | 'go-only'
  | 'java-only'
  | 'dotnet-only'
  | 'polyglot'
  | 'enterprise';

export type WorkspaceInstallMethod = 'auto' | 'poetry' | 'venv' | 'pipx';

export interface ManualWorkspaceInput {
  name: string;
  profile: WorkspaceProfile;
  installMethod: WorkspaceInstallMethod;
  skipPythonEngine: boolean;
  initGit: boolean;
  policyMode: 'warn' | 'strict';
  dependencySharing: 'isolated' | 'shared';
}

const PROFILES: { value: WorkspaceProfile; icon: string; label: string; desc: string }[] = [
  { value: 'minimal', icon: '⚡', label: 'Minimal', desc: 'Workspace foundation' },
  { value: 'python-only', icon: 'Py', label: 'Python runtime', desc: 'FastAPI, data, automation' },
  { value: 'node-only', icon: 'JS', label: 'Node.js runtime', desc: 'Frontend, NestJS, tooling' },
  { value: 'go-only', icon: 'Go', label: 'Go runtime', desc: 'Go services and CLIs' },
  { value: 'java-only', icon: 'Java', label: 'Java runtime', desc: 'Spring Boot services' },
  { value: 'dotnet-only', icon: '.NET', label: '.NET runtime', desc: 'ASP.NET Core services' },
  { value: 'polyglot', icon: 'All', label: 'Polyglot', desc: 'Multi-runtime workspace' },
  { value: 'enterprise', icon: 'Gov', label: 'Enterprise', desc: 'Governance-ready workspace' },
];

const INSTALL_METHODS: { value: WorkspaceInstallMethod; label: string; desc: string }[] = [
  { value: 'auto', label: 'Auto-detect', desc: 'Poetry if installed, else venv' },
  { value: 'poetry', label: 'Poetry', desc: 'Force Poetry' },
  { value: 'venv', label: 'venv', desc: 'Pure Python venv + pip' },
  { value: 'pipx', label: 'pipx', desc: 'Isolated pipx environments' },
];

interface ManualWorkspaceDrawerProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: ManualWorkspaceInput) => void;
  onUseAi?: () => void;
}

export function ManualWorkspaceDrawer({
  open,
  busy,
  onClose,
  onCreate,
  onUseAi,
}: ManualWorkspaceDrawerProps) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState('');
  const [stackLane, setStackLane] = useState<CreationStackLane>('balanced');
  const [profile, setProfile] = useState<WorkspaceProfile>('minimal');
  const [installMethod, setInstallMethod] = useState<WorkspaceInstallMethod>('auto');
  const [installPythonEngine, setInstallPythonEngine] = useState(false);
  const [installPythonEngineTouched, setInstallPythonEngineTouched] = useState(false);
  const [initGit, setInitGit] = useState(true);
  const [strictPolicy, setStrictPolicy] = useState(false);
  const [depSharing, setDepSharing] = useState(false);

  const suggestedName = useMemo(
    () => resolveDefaultWorkspaceName(stackLane, profile),
    [stackLane, profile]
  );

  const orderedProfiles = useMemo(() => {
    const recommended = recommendedProfilesForStackLane(stackLane);
    if (!recommended) {
      return PROFILES;
    }
    const set = new Set(recommended);
    return [
      ...PROFILES.filter((p) => set.has(p.value)),
      ...PROFILES.filter((p) => !set.has(p.value)),
    ];
  }, [stackLane]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const initial = resolveDefaultWorkspaceName('balanced', 'minimal');
    setWorkspaceName(initial);
    setNameTouched(false);
    setError('');
    setStackLane('balanced');
    setProfile('minimal');
    setInstallMethod('auto');
    setInstallPythonEngine(defaultInstallPythonEngineForProfile('minimal'));
    setInstallPythonEngineTouched(false);
    setInitGit(true);
    setStrictPolicy(false);
    setDepSharing(false);
  }, [open]);

  useEffect(() => {
    if (!open || nameTouched) {
      return;
    }
    setWorkspaceName(suggestedName);
  }, [open, nameTouched, suggestedName]);

  useEffect(() => {
    if (!open || installPythonEngineTouched) {
      return;
    }
    setInstallPythonEngine(defaultInstallPythonEngineForProfile(profile));
  }, [open, installPythonEngineTouched, profile]);

  const validateName = (name: string): boolean => {
    if (!name.trim()) {
      setError('Workspace name is required');
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      setError('Only letters, numbers, hyphens, and underscores');
      return false;
    }
    setError('');
    return true;
  };

  const handleStackLaneChange = (lane: CreationStackLane) => {
    setStackLane(lane);
    setProfile(defaultProfileForStackLane(lane));
  };

  const handleCreate = () => {
    if (!validateName(workspaceName) || busy) {
      return;
    }
    onCreate({
      name: workspaceName.trim(),
      profile,
      installMethod,
      skipPythonEngine: !installPythonEngine,
      initGit,
      policyMode: strictPolicy ? 'strict' : 'warn',
      dependencySharing: depSharing ? 'shared' : 'isolated',
    });
  };

  const showInstallMethod = installPythonEngine;
  const pathPreview = `~/.workspai/workspaces/${workspaceName || suggestedName}`;

  return (
    <Drawer
      open={open}
      sizing="auto"
      title="Create Workspace"
      subtitle="Choose stack focus, bootstrap profile, and governance."
      icon={<FolderPlus size={14} aria-hidden={true} />}
      onClose={onClose}
      footer={
        <>
          {onUseAi ? (
            <button type="button" className="ws-drawer__ghost" onClick={onUseAi}>
              <Sparkles size={12} aria-hidden={true} /> Use AI instead
            </button>
          ) : null}
          <div className="ws-drawer__foot-actions">
            <button type="button" className="ws-drawer__secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="ws-drawer__primary"
              disabled={busy || !workspaceName.trim() || Boolean(error)}
              onClick={handleCreate}
            >
              Create Workspace
            </button>
          </div>
        </>
      }
    >
      <section className="ws-drawer-section ws-drawer-section--flush">
        <span className="ws-drawer-section__label">Stack focus</span>
        <div className="ws-drawer-pills">
          {MANUAL_STACK_LANES.map((lane) => (
            <button
              key={lane.id}
              type="button"
              className={`ws-drawer-pill${stackLane === lane.id ? ' is-selected' : ''}`}
              onClick={() => handleStackLaneChange(lane.id)}
            >
              {lane.label}
            </button>
          ))}
        </div>
        <p className="ws-drawer-hint ws-drawer-hint--inline">{stackLaneGuidance(stackLane)}</p>
      </section>

      <section className="ws-drawer-section">
        <label className="ws-drawer-field">
          <span className="ws-drawer-section__label">Workspace name</span>
          <input
            className="ws-drawer-input"
            value={workspaceName}
            placeholder={suggestedName}
            spellCheck={false}
            onChange={(e) => {
              setNameTouched(true);
              setWorkspaceName(e.target.value);
              validateName(e.target.value);
            }}
          />
          <small className="ws-drawer-hint">{pathPreview}</small>
          {error ? (
            <span className="ws-drawer-error">
              <AlertCircle size={11} aria-hidden={true} /> {error}
            </span>
          ) : null}
        </label>
      </section>

      <section className="ws-drawer-section">
        <span className="ws-drawer-section__label">Bootstrap profile</span>
        <div className="ws-drawer-chip-grid">
          {orderedProfiles.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`ws-drawer-chip${profile === item.value ? ' is-selected' : ''}`}
              onClick={() => setProfile(item.value)}
              title={item.desc}
            >
              <span className="ws-drawer-chip__icon">{item.icon}</span>
              {item.label.replace(' runtime', '').replace('Node.js', 'Node')}
            </button>
          ))}
        </div>
      </section>

      {showInstallMethod ? (
        <section className="ws-drawer-section">
          <span className="ws-drawer-section__label">Install method</span>
          <div className="ws-drawer-pills">
            {INSTALL_METHODS.map((method) => (
              <button
                key={method.value}
                type="button"
                className={`ws-drawer-pill${installMethod === method.value ? ' is-selected' : ''}`}
                onClick={() => setInstallMethod(method.value)}
                title={method.desc}
              >
                {method.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="ws-drawer-section">
        <span className="ws-drawer-section__label">Options</span>
        <div className="ws-drawer-toggle-row">
          <button
            type="button"
            className={`ws-drawer-toggle${installPythonEngine ? ' is-on' : ''}`}
            onClick={() => {
              setInstallPythonEngineTouched(true);
              setInstallPythonEngine((v) => !v);
            }}
            title="Install RapidKit Core for Python/FastAPI, polyglot, and enterprise profiles"
          >
            RapidKit Core
          </button>
          <button
            type="button"
            className={`ws-drawer-toggle${initGit ? ' is-on' : ''}`}
            onClick={() => setInitGit((v) => !v)}
          >
            Git
          </button>
          <button
            type="button"
            className={`ws-drawer-toggle${strictPolicy ? ' is-on' : ''}`}
            onClick={() => setStrictPolicy((v) => !v)}
          >
            Strict policy
          </button>
          <button
            type="button"
            className={`ws-drawer-toggle${depSharing ? ' is-on' : ''}`}
            onClick={() => setDepSharing((v) => !v)}
          >
            Shared deps
          </button>
        </div>
      </section>
    </Drawer>
  );
}
