import * as vscode from 'vscode';

/** Running dev-server terminals keyed by project path. */
export const runningServers = new Map<string, vscode.Terminal>();
