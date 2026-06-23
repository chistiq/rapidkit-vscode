import { useEffect, useState } from 'react';
import { QuickActionsGrid } from './QuickActionsGrid';
import { SecondarySidebar } from './SecondarySidebar';
import { resolveSidebarVariant } from './sidebarTypes';

/**
 * React root for the Workspai sidebar webviews (roadmap item 2.11).
 */
export function SidebarApp() {
  const variant = resolveSidebarVariant();

  if (variant === 'secondary-sidebar') {
    return <SecondarySidebar />;
  }

  return <ActivityBarSidebar />;
}

function ActivityBarSidebar() {
  return (
    <div className="ws-sidebar" data-variant="activitybar">
      <QuickActionsGrid />
    </div>
  );
}
