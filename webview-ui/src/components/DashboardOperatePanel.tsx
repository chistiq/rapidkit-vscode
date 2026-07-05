import {
  DashboardOperateSection,
  type DashboardOperateSectionProps,
} from '@/components/DashboardOperateSection';

export type DashboardOperatePanelProps = DashboardOperateSectionProps;

export function DashboardOperatePanel(props: DashboardOperatePanelProps) {
  return (
    <div
      id="dashboard-panel-operate"
      role="tabpanel"
      aria-labelledby="dashboard-tab-operate"
      className="ws-dashboard-panel ws-dashboard-panel--operate"
    >
      <DashboardOperateSection {...props} />
    </div>
  );
}
