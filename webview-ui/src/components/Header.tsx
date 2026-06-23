interface HeaderProps {
  version: string;
  variant?: 'default' | 'topbar';
}

export function Header({ version: _version, variant = 'default' }: HeaderProps) {
  return (
    <div className={`header ${variant === 'topbar' ? 'header--topbar' : ''}`}>
      <img className="logo" src={(window as any).ICON_URI} alt="Workspai Logo" />
      <div className="header-copy">
        <h1>
          <span className="rapid">workspai</span>
        </h1>
        <p className="tagline">Workspace Intelligence for software systems.</p>
      </div>
      {/* <span className="version">v{version}</span> */}
    </div>
  );
}
