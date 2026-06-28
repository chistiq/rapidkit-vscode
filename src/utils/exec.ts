import { buildPackageRunnerSubprocessEnv } from './platformCapabilities';

export type ExecaResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeout?: number;
  stdio?: unknown;
  reject?: boolean;
  shell?: boolean;
} & Record<string, unknown>;

export async function run(
  cmd: string,
  args: string[],
  options?: RunOptions
): Promise<ExecaResult & Record<string, unknown>> {
  const { execa } = (await import('execa')) as any;

  // Auto-detect Windows and set shell option if not explicitly provided
  const isWindows = process.platform === 'win32';
  const mergedEnv = buildPackageRunnerSubprocessEnv({
    ...process.env,
    ...options?.env,
  });
  const finalOptions = {
    reject: false,
    stdio: 'pipe',
    shell: isWindows, // Enable shell on Windows by default for better compatibility
    ...options,
    env: mergedEnv,
  };

  return (await (execa as any)(cmd, args, finalOptions)) as any;
}
