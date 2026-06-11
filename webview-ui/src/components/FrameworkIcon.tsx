export type FrameworkKind = 'fastapi' | 'nestjs' | 'go' | 'springboot' | 'dotnet';

const FRAMEWORK_MONOGRAM: Record<FrameworkKind, string> = {
  fastapi: 'Py',
  nestjs: 'TS',
  go: 'Go',
  springboot: 'JVM',
  dotnet: '.NET',
};

function readFrameworkIconUri(framework: FrameworkKind): string | undefined {
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

interface FrameworkIconProps {
  framework: FrameworkKind;
  size?: number;
  className?: string;
}

export function FrameworkIcon({ framework, size = 16, className }: FrameworkIconProps) {
  const iconUri = readFrameworkIconUri(framework);

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
      {FRAMEWORK_MONOGRAM[framework]}
    </span>
  );
}
