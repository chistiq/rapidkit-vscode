import { Component, type ErrorInfo, type ReactNode } from 'react';

interface WebviewErrorBoundaryProps {
  children: ReactNode;
}

interface WebviewErrorBoundaryState {
  error: Error | null;
}

export class WebviewErrorBoundary extends Component<
  WebviewErrorBoundaryProps,
  WebviewErrorBoundaryState
> {
  state: WebviewErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): WebviewErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Workspai] webview render failed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="webview-fatal-state" role="alert">
        <span>Workspai dashboard failed to render</span>
        <strong>{this.state.error.message || 'Unknown webview runtime error'}</strong>
        <button type="button" onClick={() => window.location.reload()}>
          Reload dashboard
        </button>
      </main>
    );
  }
}
