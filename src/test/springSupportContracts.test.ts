import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf-8');
}

describe('spring support contracts', () => {
  it('keeps Spring project generator and create routing wired', () => {
    const coreCommandsSource = read('src/commands/coreCommands.ts');
    const createProjectSource = read('src/commands/createProject.ts');
    const projectWizardSource = read('src/ui/wizards/projectWizard.ts');
    const rapidkitCliSource = read('src/core/rapidkitCLI.ts');
    const quickLinksSource = read('webview-ui/src/components/QuickLinks.tsx');
    const appSource = read('webview-ui/src/App.tsx');

    expect(coreCommandsSource).toContain("'workspai.createSpringBootProject'");
    expect(coreCommandsSource).toContain(
      "await createProjectCommand(selectedWorkspace?.path, 'springboot', projectName);"
    );

    expect(createProjectSource).toContain(
      "preselectedFramework?: 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet'"
    );
    expect(projectWizardSource).toContain("framework: 'springboot' as const");
    expect(projectWizardSource).toContain("framework: 'dotnet' as const");
    expect(projectWizardSource).toContain('Spring Boot');
    expect(projectWizardSource).toContain('.NET Web API');

    expect(rapidkitCliSource).toContain('springboot.standard');
    expect(rapidkitCliSource).toContain('dotnet.webapi.clean');
    expect(rapidkitCliSource).toContain("'create',");
    expect(rapidkitCliSource).toContain('options.kit');

    expect(quickLinksSource).toContain("framework: 'springboot'");
    expect(quickLinksSource).toContain("framework: 'dotnet'");
    expect(appSource).toContain(
      'const handleCreateProject = (projectName: string, framework: AICreateFramework, kitName: string) =>'
    );
  });

  it('keeps Spring runtime lifecycle safeguards active for Java dev flow', () => {
    const lifecycleSource = read('src/commands/projectLifecycle.ts');

    expect(lifecycleSource).toContain("const isSpringBootProject = projectType === 'springboot';");
    expect(lifecycleSource).toContain(
      "const hasMaven = fs.existsSync(path.join(projectPath, 'mvnw'));"
    );
    expect(lifecycleSource).toContain("const hasSystemMaven = await hasCommandAvailable('mvn');");
    expect(lifecycleSource).toContain(
      "const hasSystemGradle = await hasCommandAvailable('gradle');"
    );
    expect(lifecycleSource).toContain(
      'Java pre-flight: check JDK availability before starting Spring Boot'
    );
    expect(lifecycleSource).toContain('☕ Java (JDK) not found');
    expect(lifecycleSource).toContain('▶️ Started Spring Boot server on port');
    expect(lifecycleSource).toContain('/swagger-ui/index.html');
    expect(lifecycleSource).toContain('Open /actuator/health');
  });

  it('keeps Spring detection and doctor requirements aligned', () => {
    const detectorSource = read('src/core/workspaceDetector.ts');
    const doctorSource = read('src/commands/doctor.ts');
    const packageJsonSource = read('package.json');

    expect(detectorSource).toContain("const pomXmlPath = path.join(projectPath, 'pom.xml');");
    expect(detectorSource).toContain("const gradlePath = path.join(projectPath, 'build.gradle');");
    expect(detectorSource).toContain(
      "const gradleKtsPath = path.join(projectPath, 'build.gradle.kts');"
    );
    expect(detectorSource).toContain("type = 'springboot';");
    expect(detectorSource).toContain("kit = 'springboot.standard';");

    expect(doctorSource).toContain("name: 'Java (JDK)'");
    expect(doctorSource).toContain("name: 'Maven'");
    expect(doctorSource).toContain("name: 'Gradle'");
    expect(doctorSource).toContain('required for springboot.standard projects');

    expect(packageJsonSource).toContain('"command": "workspai.createSpringBootProject"');
    expect(packageJsonSource).toContain('"springboot.standard"');
  });
});
