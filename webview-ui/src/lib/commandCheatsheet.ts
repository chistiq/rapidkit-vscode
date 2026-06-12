import { buildRapidkitDisplayCommand } from './rapidkitCommandText';

export type CommandCheatsheetEntry = {
  label: string;
  command: string;
  scope: 'workspace' | 'project' | 'module';
  note?: string;
};

export type CommandCheatsheetGroup = {
  id: string;
  title: string;
  entries: CommandCheatsheetEntry[];
};

export const COMMAND_CHEATSHEET_GROUPS: CommandCheatsheetGroup[] = [
  {
    id: 'workspace',
    title: 'Workspace',
    entries: [
      { label: 'Bootstrap', command: 'rapidkit bootstrap', scope: 'workspace' },
      {
        label: 'Setup runtime',
        command: 'rapidkit setup <python|node|go|java|dotnet>',
        scope: 'workspace',
      },
      { label: 'Doctor', command: 'rapidkit doctor workspace', scope: 'workspace' },
      { label: 'Analyze', command: 'rapidkit analyze --json --strict', scope: 'workspace' },
      { label: 'Readiness', command: 'rapidkit readiness --json', scope: 'workspace' },
      { label: 'Autopilot release', command: 'rapidkit autopilot release', scope: 'workspace' },
      { label: 'Snapshot', command: 'rapidkit snapshot create', scope: 'workspace' },
      { label: 'Mirror sync', command: 'rapidkit mirror sync', scope: 'workspace' },
      { label: 'Cache status', command: 'rapidkit cache status', scope: 'workspace' },
      { label: 'Infra plan', command: 'rapidkit infra plan', scope: 'workspace' },
    ],
  },
  {
    id: 'project',
    title: 'Project',
    entries: [
      { label: 'Init', command: 'rapidkit init', scope: 'project' },
      { label: 'Dev', command: 'rapidkit dev', scope: 'project' },
      { label: 'Test', command: 'rapidkit test', scope: 'project' },
      { label: 'Build', command: 'rapidkit build', scope: 'project' },
      { label: 'Lint', command: 'rapidkit lint', scope: 'project' },
      { label: 'Format', command: 'rapidkit format', scope: 'project' },
      { label: 'Doctor', command: 'rapidkit doctor project', scope: 'project' },
      { label: 'Doctor fix', command: 'rapidkit doctor project --fix', scope: 'project' },
    ],
  },
  {
    id: 'modules',
    title: 'Modules (FastAPI & NestJS)',
    entries: [
      {
        label: 'Add module',
        command: buildRapidkitDisplayCommand(['add', 'module', '<slug>']),
        scope: 'module',
      },
      { label: 'Upgrade', command: 'rapidkit upgrade module <slug>', scope: 'module' },
      { label: 'Diff', command: 'rapidkit diff module <slug>', scope: 'module' },
      { label: 'Rollback', command: 'rapidkit rollback module <slug>', scope: 'module' },
      { label: 'Uninstall', command: 'rapidkit uninstall module <slug>', scope: 'module' },
      {
        label: 'List installed',
        command: 'rapidkit list modules',
        scope: 'module',
        note: 'FastAPI/NestJS projects only',
      },
    ],
  },
];
