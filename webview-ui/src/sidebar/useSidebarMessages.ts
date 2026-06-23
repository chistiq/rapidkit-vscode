import { useEffect, useRef } from 'react';

export interface SidebarInboundMessage {
  command: string;
  data: Record<string, unknown>;
}

/**
 * Subscribe to host → webview messages for the sidebar (roadmap 2.11). Mirrors
 * the dashboard's `window.addEventListener('message')` pattern but scoped to the
 * `sidebar*` protocol. The handler always receives a normalized `{ command, data }`.
 */
export function useSidebarMessages(handler: (message: SidebarInboundMessage) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const raw = event.data;
      if (!raw || typeof raw.command !== 'string') {
        return;
      }
      const data =
        raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
          ? (raw.data as Record<string, unknown>)
          : {};
      handlerRef.current({ command: raw.command, data });
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);
}
