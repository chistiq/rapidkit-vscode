import type { BackendScaffoldFramework, FrontendScaffoldFramework, ScaffoldFramework } from '@/types';

export type FrameworkKind = ScaffoldFramework;

const FRAMEWORK_MONOGRAM: Record<string, string> = {
  fastapi: 'Py',
  nestjs: 'TS',
  go: 'Go',
  springboot: 'JVM',
  dotnet: '.NET',
  rust: 'Rs',
  laravel: 'Lv',
  tauri: 'Ta',
  electron: 'El',
  'vscode-extension': 'VS',
  nextjs: 'Nx',
  remix: 'Rx',
  'vite-react': 'VR',
  'vite-vue': 'VV',
  'vite-svelte': 'VS',
  'vite-solid': 'Sd',
  'vite-vanilla': 'Vt',
  nuxt: 'Nu',
  angular: 'Ng',
  astro: 'As',
  sveltekit: 'SK',
};

function readFrameworkIconUri(framework: BackendScaffoldFramework): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const icons = window as Window & {
    FASTAPI_ICON_URI?: string;
    NESTJS_ICON_URI?: string;
    GO_ICON_URI?: string;
    SPRINGBOOT_ICON_URI?: string;
    DOTNET_ICON_URI?: string;
  };

  switch (framework) {
    case 'fastapi':
      return icons.FASTAPI_ICON_URI;
    case 'nestjs':
      return icons.NESTJS_ICON_URI;
    case 'go':
      return icons.GO_ICON_URI;
    case 'springboot':
      return icons.SPRINGBOOT_ICON_URI;
    case 'dotnet':
      return icons.DOTNET_ICON_URI;
    default:
      return undefined;
  }
}

function isBackendFramework(framework: ScaffoldFramework): framework is BackendScaffoldFramework {
  return ['fastapi', 'nestjs', 'go', 'springboot', 'dotnet', 'rust', 'laravel'].includes(
    framework
  );
}

interface FrameworkIconProps {
  framework: ScaffoldFramework;
  size?: number;
  className?: string;
}

export function FrameworkIcon({ framework, size = 16, className }: FrameworkIconProps) {
  const iconUri = isBackendFramework(framework) ? readFrameworkIconUri(framework) : undefined;

  if (iconUri) {
    return (
      <img
        src={iconUri}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ objectFit: 'contain' }}
      />
    );
  }

  return (
    <span className={`enterprise-framework-monogram${className ? ` ${className}` : ''}`}>
      {FRAMEWORK_MONOGRAM[framework] ?? 'FE'}
    </span>
  );
}
