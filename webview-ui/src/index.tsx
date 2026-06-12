import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { WebviewErrorBoundary } from '@/components/WebviewErrorBoundary';
import { WorkspaiThemeProvider } from '@/components/WorkspaiThemeProvider';
import '@/styles/workspai-tokens.css';
import '@/styles-tailwind.css';
import '@/styles/workspai-primitives.css';
import '@/styles/workspai-studio.css';
import '@/styles/workspai-studio-chrome.css';
import '@/styles/workspai-analyze-report.css';
import '@/styles/responsive.css';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <WorkspaiThemeProvider>
                <WebviewErrorBoundary>
                    <App />
                </WebviewErrorBoundary>
            </WorkspaiThemeProvider>
        </StrictMode>
    );
}
