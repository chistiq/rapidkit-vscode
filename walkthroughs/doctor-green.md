# Run Doctor until it is green

The workspace **doctor** scans your projects for missing dependencies, unhealthy modules, failing probes, and security issues. Results are written to:

```
.rapidkit/reports/doctor-last-run.json
```

The **Workspace Health** view shows a live score. Use **Fix with AI** on any issue node to resolve problems quickly.

This step completes when the doctor reports a **green** score — zero errors and zero warnings. (Warnings-only stays amber, not green.)
