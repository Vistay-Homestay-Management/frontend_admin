import type { BackofficeViewer } from '@vistay/admin-api-client'
import { AnalyticsDashboard } from './AnalyticsDashboard'

export function OverviewDashboard(props: { graphqlUrl: string; accessToken: string; viewer: BackofficeViewer }) {
  return <AnalyticsDashboard {...props} compact />
}
