# Check workspace health

Workspace Doctor checks runtime tools, dependencies, tests, security, and other
project-specific readiness surfaces. Its current workspace result is written to:

```
.workspai/reports/doctor-last-run.json
```

Project Doctor results retain project identity under
`.workspai/reports/projects/`.

The **Workspace Health** view distinguishes passed, warning, blocked, missing,
and stale evidence. Use **Fix with Workspai** to open a scoped Agent repair
session. Release verification requires current evidence with no remaining
blocking finding. Warnings remain visible as advisories and should be reviewed,
fixed, or documented according to workspace policy; command success alone is
not enough.
