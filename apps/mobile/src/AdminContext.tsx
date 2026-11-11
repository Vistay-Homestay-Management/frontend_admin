import { createContext, useContext, type PropsWithChildren } from 'react'
import type { BackofficeViewer } from '@vistay/admin-api-client'
import type { MobileConfig } from './config'
import type { NotificationInboxModel } from './useBackofficeData'

interface AdminContextValue {
  accessToken: string
  config: MobileConfig
  inbox: NotificationInboxModel
  retryViewer: () => void
  viewer: BackofficeViewer
}

const AdminContext = createContext<AdminContextValue | null>(null)

export function AdminProvider({ children, value }: PropsWithChildren<{ value: AdminContextValue }>) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext)
  if (!value) throw new Error('AdminProvider is missing')
  return value
}
