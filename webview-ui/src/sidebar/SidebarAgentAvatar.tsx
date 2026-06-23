interface SidebarAgentAvatarProps {
  /** Spinning focus ring while the agent is thinking or streaming. */
  active?: boolean;
}

/** Workspai mark beside AI bubbles — restores the pre-React sidebar identity cue. */
export function SidebarAgentAvatar({ active = false }: SidebarAgentAvatarProps) {
  const iconUri = typeof window !== 'undefined' ? window.ICON_URI : undefined;

  return (
    <span
      className={`ws-sidebar__agent-avatar${active ? ' is-active' : ''}`}
      aria-hidden="true"
    >
      <span className="ws-sidebar__agent-avatar__ring" />
      <span className="ws-sidebar__agent-avatar__mark">
        {iconUri ? <img src={iconUri} alt="" /> : <span className="ws-sidebar__agent-avatar__fallback">wi</span>}
      </span>
    </span>
  );
}
