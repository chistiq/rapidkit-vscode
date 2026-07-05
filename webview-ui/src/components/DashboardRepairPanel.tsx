import {
  DashboardRepairFlow,
  type DashboardRepairFlowProps,
} from '@/components/DashboardRepairFlow';

export type DashboardRepairPanelProps = DashboardRepairFlowProps;

export function DashboardRepairPanel(props: DashboardRepairPanelProps) {
  return (
    <div
      id="dashboard-panel-repair"
      role="tabpanel"
      aria-labelledby="dashboard-tab-repair"
      className="ws-dashboard-panel ws-dashboard-panel--repair"
    >
      <DashboardRepairFlow {...props} />
    </div>
  );
}
