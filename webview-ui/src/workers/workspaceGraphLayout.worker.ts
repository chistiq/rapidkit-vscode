import { layoutWorkspaceGraph, type GraphLayoutRequest } from '../lib/workspaceGraphLayout';

self.onmessage = (event: MessageEvent<GraphLayoutRequest>) => {
  self.postMessage(layoutWorkspaceGraph(event.data));
};
