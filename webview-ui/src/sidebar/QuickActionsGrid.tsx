import { Home, Plus, Sparkles, Stethoscope, type LucideIcon } from 'lucide-react';
import { vscode } from '@/vscode';

interface QuickAction {
  command: string;
  label: string;
  title: string;
  icon: LucideIcon;
  tone?: 'grounding' | 'studio' | 'doctor';
}

const QUICK_ACTIONS: QuickAction[] = [
  { command: 'openWelcome', label: 'Dashboard', title: 'Open Workspai dashboard', icon: Home },
  { command: 'createWithAI', label: 'Create', title: 'Create with AI', icon: Plus },
  {
    command: 'incidentStudioNext',
    label: 'Studio',
    title: 'Open Studio',
    icon: Sparkles,
    tone: 'studio',
  },
  {
    command: 'doctor',
    label: 'Doctor',
    title: 'Run workspace doctor',
    icon: Stethoscope,
    tone: 'doctor',
  },
];

export function QuickActionsGrid() {
  const runAction = (command: string) => {
    vscode.postMessage(command, {}, { source: 'workspai-sidebar-react', version: '1' });
  };

  return (
    <section className="ws-sidebar__panel ws-sidebar__panel--actions" aria-label="Quick Actions">
      <div className="ws-sidebar__grid" role="group" aria-label="Quick Actions">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          const toneClass = action.tone ? ` ws-sidebar__tile--${action.tone}` : '';
          return (
            <button
              key={action.command}
              type="button"
              className={`ws-sidebar__tile${toneClass}`}
              title={action.title}
              onClick={() => runAction(action.command)}
            >
              <Icon size={16} aria-hidden={true} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
