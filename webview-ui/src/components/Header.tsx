interface HeaderProps {
  version: string;
}

export function Header({ version: _version }: HeaderProps) {
  return (
    <div className="header">
      <img className="logo" src={(window as any).ICON_URI} alt="Workspai Logo" />
      <div className="header-copy">
        <h1>
          <span className="rapid">workspai</span>
        </h1>
        <p className="tagline">AI workspace command center for backend teams.</p>
      </div>
      {/* <span className="version">v{version}</span> */}
    </div>
  );
}
