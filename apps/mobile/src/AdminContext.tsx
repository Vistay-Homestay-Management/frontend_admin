import { createContext, useContext, type PropsWithChildren } from 'react'
import type { BackofficeViewer } from '@vistay/admin-api-client'
import type { MobileConfig } from './config'
import type { NotificationInboxModel } from './useBackofficeData'
import type { MobileRuntime } from './mobileRuntime'

export interface AdminContextValue {
  accessToken: string
  authorizationReady?: boolean
  config: MobileConfig
  inbox: NotificationInboxModel
  isRevalidating?: boolean
  retryViewer: () => void
  runtime: MobileRuntime
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
