import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceDetector } from '../core/workspaceDetector';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: undefined,
  },
  window: {
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      clear: () => undefined,
      dispose: () => undefined,
    }),
  },
}));

describe('WorkspaceDetector (Go support)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (WorkspaceDetector as any).instance = undefined;
  });

  it('detects a Go RapidKit project from go.mod', async () => {
    const detector = WorkspaceDetector.getInstance();
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-go-detector-'));

    fs.mkdirSync(path.join(projectPath, '.rapidkit'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, '.rapidkit', 'project.json'), '{}');
    fs.writeFileSync(path.join(projectPath, 'go.mod'), 'module github.com/acme/sample\n');

    const isRapidKit = await (detector as any).isRapidKitProject(projectPath);
    const analyzed = await (detector as any).analyzeProject(projectPath);

    expect(isRapidKit).toBe(true);
    expect(analyzed).not.toBeNull();
    expect(analyzed.type).toBe('go');

    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('detects open governed workspace roots for one-click registration', async () => {
    const detector = WorkspaceDetector.getInstance();
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-detected-ws-'));
    fs.writeFileSync(
      path.join(workspacePath, '.rapidkit-workspace'),
      JSON.stringify({ createdBy: 'rapidkit-npm' }, null, 2)
    );
    const vscode = await import('vscode');
    (vscode.workspace as any).workspaceFolders = [
      {
        uri: { fsPath: workspacePath },
        name: path.basename(workspacePath),
        index: 0,
      },
    ];

    const detected = await detector.detectWorkspaceRoots();

    expect(detected).toEqual([{ name: path.basename(workspacePath), path: workspacePath }]);
    fs.rmSync(workspacePath, { recursive: true, force: true });
    (vscode.workspace as any).workspaceFolders = undefined;
  });

  it('keeps Go precedence when package.json also exists', async () => {
    const detector = WorkspaceDetector.getInstance();
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-go-priority-'));

    fs.mkdirSync(path.join(projectPath, '.rapidkit'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, '.rapidkit', 'project.json'), '{}');
    fs.writeFileSync(path.join(projectPath, 'go.mod'), 'module github.com/acme/sample\n');
    fs.writeFileSync(
      path.join(projectPath, 'package.json'),
      JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } })
    );

    const analyzed = await (detector as any).analyzeProject(projectPath);

    expect(analyzed).not.toBeNull();
    expect(analyzed.type).toBe('go');

    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('identifies gofiber.standard when go.mod contains Fiber dependency', async () => {
    const detector = WorkspaceDetector.getInstance();
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-go-fiber-detector-'));

    fs.mkdirSync(path.join(projectPath, '.rapidkit'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, '.rapidkit', 'project.json'), '{}');
    fs.writeFileSync(
      path.join(projectPath, 'go.mod'),
      `module github.com/acme/fiber-svc

go 1.24

require github.com/gofiber/fiber/v2 v2.52.5
`
    );

    const analyzed = await (detector as any).analyzeProject(projectPath);

    expect(analyzed).not.toBeNull();
    expect(analyzed.type).toBe('go');
    expect(analyzed.kit).toBe('gofiber.standard');

    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('identifies gogin.standard when go.mod contains Gin dependency', async () => {
    const detector = WorkspaceDetector.getInstance();
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-go-gin-detector-'));

    fs.mkdirSync(path.join(projectPath, '.rapidkit'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, '.rapidkit', 'project.json'), '{}');
    fs.writeFileSync(
      path.join(projectPath, 'go.mod'),
      `module github.com/acme/gin-svc

go 1.24

require github.com/gin-gonic/gin v1.10.0
`
    );

    const analyzed = await (detector as any).analyzeProject(projectPath);

    expect(analyzed).not.toBeNull();
    expect(analyzed.type).toBe('go');
    expect(analyzed.kit).toBe('gogin.standard');

    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('detects Spring Boot projects from pom.xml', async () => {
    const detector = WorkspaceDetector.getInstance();
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rk-spring-detector-'));

    fs.mkdirSync(path.join(projectPath, '.rapidkit'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, '.rapidkit', 'project.json'), '{}');
    fs.writeFileSync(
      path.join(projectPath, 'pom.xml'),
      '<project><groupId>com.acme</groupId><artifactId>orders</artifactId></project>'
    );

    const analyzed = await (detector as any).analyzeProject(projectPath);

    expect(analyzed).not.toBeNull();
    expect(analyzed.type).toBe('springboot');
    expect(analyzed.kit).toBe('springboot.standard');

    fs.rmSync(projectPath, { recursive: true, force: true });
  });
});
