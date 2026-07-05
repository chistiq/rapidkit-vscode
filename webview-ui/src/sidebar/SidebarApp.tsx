import { useState } from 'react';
import { QuickActionsGrid } from './QuickActionsGrid';
import { SecondarySidebar } from './SecondarySidebar';
import { resolveSidebarVariant } from './sidebarTypes';
import { useSidebarMessages } from './useSidebarMessages';
import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';
import {
  normalizeThemeMode,
  type ThemeMode,
} from '@/components/StudioRedesign/styles/themeSystem';

/**
 * React root for the Workspai sidebar webviews (roadmap item 2.11).
 */
export function SidebarApp() {
  const variant = resolveSidebarVariant();
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');

  useSidebarMessages(({ command, data }) => {
    if (command === 'sidebarThemeSettings') {
      setThemeMode(normalizeThemeMode(data.themeMode));
    }
  });

  return (
    <WorkspaiThemeProvider themeMode={themeMode}>
      {variant === 'secondary-sidebar' ? <SecondarySidebar /> : <ActivityBarSidebar />}
    </WorkspaiThemeProvider>
  );
}

function ActivityBarSidebar() {
  return (
    <div className="ws-sidebar" data-variant="activitybar">
      <QuickActionsGrid />
    </div>
  );
}
