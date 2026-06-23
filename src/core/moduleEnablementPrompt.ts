import * as vscode from 'vscode';

export async function promptEnableModulesOption(title: string): Promise<boolean | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: 'Standard import/adopt',
        description: 'Module commands follow runtime support matrix defaults',
        value: false,
      },
      {
        label: 'Enable module commands',
        description: 'Pass --enable-modules for supported core runtimes',
        value: true,
      },
    ],
    {
      title,
      placeHolder: 'Module command support',
      ignoreFocusOut: true,
    }
  );

  if (!choice) {
    return undefined;
  }

  return choice.value;
}

/** Use dashboard/webview preset when provided; otherwise show the QuickPick gate. */
export async function resolveEnableModulesPreference(
  title: string,
  preset?: boolean
): Promise<boolean | undefined> {
  if (typeof preset === 'boolean') {
    return preset;
  }
  return promptEnableModulesOption(title);
}
