# Generate your first workspace model

The **workspace model** is the foundation of Workspace Intelligence. It produces a dependency-graph-aware map of your projects written to:

```
.rapidkit/reports/workspace-model.json
```

This model drives:

- **Impact** analysis — transitive blast radius of a change.
- **Verify** — subgraph-scoped, graph-aware freshness and policy checks.
- **AI grounding** — the context your agents rely on.

This step completes automatically once `workspace-model.json` exists.
