interface HeaderProps {
  version: string;
  variant?: 'default' | 'topbar' | 'inline';
}

const TAGLINE = 'Workspace Intelligence for software systems.';
const TAGLINE_INLINE = 'Workspace Intelligence';

export function Header({ version: _version, variant = 'default' }: HeaderProps) {
  const isInline = variant === 'inline';

  return (
    <div
      className={[
        'header',
        variant === 'topbar' ? 'header--topbar' : '',
        isInline ? 'header--inline workspai-view-tabs__brand' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={isInline ? TAGLINE : undefined}
    >
      <img className="logo" src={(window as any).ICON_URI} alt="Workspai Logo" />
      <div className="header-copy">
        <h1>
          <span className="rapid">workspai</span>
        </h1>
        <p className={`tagline ${isInline ? 'tagline--inline' : ''}`}>
          {isInline ? TAGLINE_INLINE : TAGLINE}
        </p>
      </div>
    </div>
  );
}
