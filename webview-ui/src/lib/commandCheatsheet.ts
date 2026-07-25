import { buildRapidkitDisplayCommand } from './rapidkitCommandText';
import {
  buildWorkspaceExplainCliSnippet,
  buildWorkspaceGraphExplainCliSnippet,
  buildWorkspaceTraceCliSnippet,
  buildWorkspaceWhyCliSnippet,
} from './workspaceIntelligencePaths';

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
      { label: 'Bootstrap', command: 'workspai bootstrap', scope: 'workspace' },
      {
        label: 'Setup runtime',
        command: 'workspai setup <python|node|go|java|dotnet>',
        scope: 'workspace',
      },
      { label: 'Doctor', command: 'workspai doctor workspace', scope: 'workspace' },
      {
        label: 'Analyze',
        command: 'workspai analyze --json',
        scope: 'workspace',
        note: 'Use --strict for CI gates; interactive runs omit strict so scaffold workspaces stay needs-attention',
      },
      {
        label: 'Governance pipeline',
        command: 'workspai pipeline --json --strict',
        scope: 'workspace',
        note: 'Sync → doctor → analyze → readiness → autopilot',
      },
      { label: 'Readiness', command: 'workspai readiness --json', scope: 'workspace' },
      { label: 'Autopilot release', command: 'workspai autopilot release', scope: 'workspace' },
      { label: 'Snapshot', command: 'workspai snapshot create', scope: 'workspace' },
      { label: 'Mirror sync', command: 'workspai mirror sync', scope: 'workspace' },
      { label: 'Cache status', command: 'workspai cache status', scope: 'workspace' },
      { label: 'Infra plan', command: 'workspai infra plan', scope: 'workspace' },
      {
        label: 'Agent grounding sync',
        command:
          'workspai workspace agent-sync --write --refresh-context --preset enterprise --target vscode --json',
        scope: 'workspace',
        note: 'INDEX.json + AGENTS.md + Copilot/Cursor/Claude hooks',
      },
      {
        label: 'Agent context pack',
        command: 'workspai workspace context --for-agent --json --write',
        scope: 'workspace',
      },
      {
        label: 'Workspace explain',
        command: buildWorkspaceExplainCliSnippet().replace(/^npx /, ''),
        scope: 'workspace',
      },
      {
        label: 'Workspace why',
        command: buildWorkspaceWhyCliSnippet().replace(/^npx /, ''),
        scope: 'workspace',
      },
      {
        label: 'Workspace trace',
        command: buildWorkspaceTraceCliSnippet().replace(/^npx /, ''),
        scope: 'workspace',
      },
      {
        label: 'Workspace graph explain',
        command: buildWorkspaceGraphExplainCliSnippet().replace(/^npx /, ''),
        scope: 'workspace',
      },
      {
        label: 'Workspace watch',
        command: 'workspai workspace watch --once --json',
        scope: 'workspace',
      },
      {
        label: 'Workspace MCP serve',
        command: 'workspai workspace mcp serve',
        scope: 'workspace',
      },
    ],
  },
  {
    id: 'project',
    title: 'Project',
    entries: [
      { label: 'Init', command: 'workspai init', scope: 'project' },
      { label: 'Dev', command: 'workspai dev', scope: 'project' },
      { label: 'Test', command: 'workspai test', scope: 'project' },
      { label: 'Build', command: 'workspai build', scope: 'project' },
      { label: 'Lint', command: 'workspai lint', scope: 'project' },
      { label: 'Format', command: 'workspai format', scope: 'project' },
      { label: 'Doctor', command: 'workspai doctor project', scope: 'project' },
      { label: 'Doctor fix', command: 'workspai doctor project --fix', scope: 'project' },
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
      { label: 'Upgrade', command: 'workspai upgrade module <slug>', scope: 'module' },
      { label: 'Diff', command: 'workspai diff module <slug>', scope: 'module' },
      { label: 'Rollback', command: 'workspai rollback module <slug>', scope: 'module' },
      { label: 'Uninstall', command: 'workspai uninstall module <slug>', scope: 'module' },
      {
        label: 'List installed',
        command: 'workspai list modules',
        scope: 'module',
        note: 'FastAPI/NestJS projects only',
      },
    ],
  },
];
