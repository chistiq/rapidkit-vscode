import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { SetupExperience } from '@/components/SetupExperience';
import { WebviewErrorBoundary } from '@/components/WebviewErrorBoundary';
import '@/styles-tailwind.css';
import '@/styles/responsive.css';

declare global {
    interface Window {
        WORKSPAI_VIEW?: 'welcome' | 'setup';
    }
}

const root = document.getElementById('root');
if (root) {
    const view = window.WORKSPAI_VIEW || 'welcome';
    const content = view === 'setup' ? <SetupExperience /> : <App />;

    createRoot(root).render(
        <StrictMode>
            <WebviewErrorBoundary>{content}</WebviewErrorBoundary>
        </StrictMode>
    );
}
