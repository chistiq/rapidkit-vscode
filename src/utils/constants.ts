/**
 * Extension Constants
 * Centralized constants for the Workspai VS Code extension
 */

import * as vscode from 'vscode';

/**
 * Get the current extension version dynamically from package.json
 */
export function getExtensionVersion(): string {
  const extension = vscode.extensions.getExtension('rapidkit.rapidkit-vscode');
  return extension?.packageJSON?.version || '0.4.4';
}

/**
 * Extension metadata
 */
export const EXTENSION = {
  ID: 'rapidkit.rapidkit-vscode',
  NAME: 'Workspai',
  PUBLISHER: 'rapidkit',
} as const;

/**
 * Marker file signatures (aligned with rapidkit-npm package)
 */
export const MARKERS = {
  /** Unified signature for all workspace markers (npm + extension) */
  WORKSPACE_SIGNATURE: 'RAPIDKIT_WORKSPACE',
  /** Legacy VS Code-specific signature; still accepted for detection */
  WORKSPACE_SIGNATURE_LEGACY: 'RAPIDKIT_VSCODE_WORKSPACE',
  /** createdBy value when marker is written by npm package */
  CREATED_BY_NPM: 'rapidkit-npm',
  /** createdBy value when marker is written by extension */
  CREATED_BY_VSCODE: 'rapidkit-vscode',
} as const;

/**
 * URLs
 */
export const URLS = {
  DOCS: 'https://www.workspai.dev/learn',
  TROUBLESHOOTING: 'https://www.workspai.dev/learn/workspace-doctor',
  GITHUB: 'https://github.com/chistiq/rapidkit-vscode',
  MARKETPLACE: 'https://marketplace.visualstudio.com/items?itemName=rapidkit.rapidkit-vscode',
} as const;
