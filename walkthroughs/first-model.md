# Generate the workspace model

The **workspace model** is the foundation of Workspace Intelligence. It produces a dependency-graph-aware map of your projects written to:

```
.workspai/reports/workspace-model.json
```

The model defines the canonical workspace boundary and drives:

- **Impact** analysis — transitive blast radius of a change.
- **Verify** — subgraph-scoped, graph-aware freshness and policy checks.
- **AI grounding** — the context your agents rely on.

The graph enriches this model with proof-carrying relationships. The step
completes only when the model is current for the selected workspace; a stale
file is not presented as complete.
