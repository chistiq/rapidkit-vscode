import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SidebarApp } from './SidebarApp';
import { WebviewErrorBoundary } from '@/components/WebviewErrorBoundary';
import '@/styles/workspai-tokens.css';
import '@/styles-tailwind.css';
import '@/styles/workspai-primitives.css';
import './sidebar.css';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <WebviewErrorBoundary>
        <SidebarApp />
      </WebviewErrorBoundary>
    </StrictMode>
  );
}
