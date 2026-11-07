import {
  ArrowClockwise,
  Bell,
  Buildings,
  CalendarDots,
  CaretDoubleRight,
  ChartBar,
  CheckCircle,
  FileText,
  Key,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  SpinnerGap,
  SquaresFour,
  UserCircle,
  WarningCircle,
  WifiHigh,
} from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useAuth } from 'react-oidc-context'
import './App.css'
import vistayLogo from './assets/vistay-logo.png'
import { AuthorizationConsole } from './AuthorizationConsole'
import { AccountProvisioning } from './AccountProvisioning'
import { SecuritySessions } from './SecuritySessions'
import { PersonalProfileEditor } from './PersonalProfileEditor'
import { AccountSecurityConsole } from './AccountSecurityConsole'
import { InventoryWorkspace } from './InventoryWorkspace'
import { PropertyManagement } from './PropertyManagement'
import { OverviewDashboard } from './OverviewDashboard'
import { NotificationInbox } from './NotificationInbox'
import { NotificationPreferences } from './NotificationPreferences'
import { NotificationTemplateWorkspace } from './NotificationTemplateWorkspace'
import { DynamicConfigurationWorkspace } from './DynamicConfigurationWorkspace'
import { AnalyticsDashboard } from './AnalyticsDashboard'
import type { RuntimeConfig } from './lib/config'
import { useNotificationInbox, useViewer, type StreamStatus } from './lib/useBackofficeData'

interface AppProps {
  config: RuntimeConfig
}

const streamLabels: Record<StreamStatus, string> = {
  connecting: 'Đang kết nối',
  live: 'Đang trực tuyến',
  retrying: 'Đang kết nối lại',
  error: 'Mất kết nối',
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="centered-state" aria-live="polite">
      <SpinnerGap className="spinner" aria-hidden />
      <h1>{label}</h1>
      <p>ViStay đang thiết lập phiên làm việc an toàn.</p>
    </main>
  )
}

function LoginScreen({ error, onLogin }: { error?: string; onLogin: () => void }) {
  return (
    <main className="login-shell">
      <section className="login-copy">
        <a className="wordmark" href="/" aria-label="ViStay Backoffice">ViStay<span>.</span></a>
        <p className="eyebrow">BACKOFFICE / EPIC 01</p>
        <h1>Một cửa vào.<br />Đúng quyền hạn.</h1>
        <p className="lead">
          Đăng nhập bằng tài khoản vận hành để xem hồ sơ phân quyền và nhận thông báo
          bảo mật theo thời gian thực.
        </p>
        {error && <div className="error-banner" role="alert"><WarningCircle />{error}</div>}
        <button className="primary-button" onClick={onLogin}>
          Đăng nhập Backoffice <Key weight="bold" />
        </button>
      </section>
      <aside className="security-panel">
        <ShieldCheck weight="duotone" aria-hidden />
        <div>
          <span>Đăng nhập an toàn</span>
          <h2>Authorization Code + PKCE</h2>
          <p>
            Mật khẩu chỉ được nhập tại Backoffice Realm. Ứng dụng không nhúng client secret
            và chỉ gửi access token đến GraphQL Gateway đã cấu hình.
          </p>
        </div>
        <ul>
          <li><CheckCircle /> Chống đánh cắp authorization code</li>
          <li><CheckCircle /> Phiên web chỉ lưu trong session hiện tại</li>
          <li><CheckCircle /> Quyền được kiểm tra lại ở từng service</li>
        </ul>
      </aside>
    </main>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()
}

type AdminPage = 'overview' | 'analytics' | 'inventory' | 'management' | 'profile' | 'notifications' | 'accounts' | 'authorization' | 'configuration' | 'templates' | 'preferences'

const pageTitles: Record<AdminPage, { eyebrow: string; title: string }> = {
  overview: { eyebrow: 'THÔNG TIN CHUNG', title: 'Toàn cảnh vận hành' },
  analytics: { eyebrow: 'ANALYTICS CONTROL ROOM', title: 'Thống kê chuyên sâu' },
  inventory: { eyebrow: 'TRUNG TÂM VẬN HÀNH', title: 'Tồn phòng & sơ đồ căn' },
  management: { eyebrow: 'PROPERTY MASTER / UNIT CATALOG', title: 'Quản lý tòa và căn' },
  profile: { eyebrow: 'HỒ SƠ CÁ NHÂN', title: 'Phiên làm việc của bạn' },
  notifications: { eyebrow: 'DURABLE INBOX', title: 'Thông báo vận hành' },
  accounts: { eyebrow: 'QUẢN TRỊ DANH TÍNH', title: 'Tài khoản Backoffice' },
  authorization: { eyebrow: 'KIỂM SOÁT TRUY CẬP', title: 'Phân quyền ba lớp' },
  configuration: { eyebrow: 'POLICY CONTROL PLANE', title: 'Cấu hình nghiệp vụ động' },
  templates: { eyebrow: 'TEMPLATE CONTROL PLANE', title: 'Template thông báo' },
  preferences: { eyebrow: 'CHANNEL POLICY', title: 'Kênh nhận thông báo' },
}

const navigationItems = [
  { page: 'overview', label: 'Chung', icon: SquaresFour },
  { page: 'inventory', label: 'Booking', icon: CalendarDots },
  { page: 'management', label: 'Căn hộ', icon: Buildings },
  { page: 'analytics', label: 'Thống kê', icon: ChartBar },
  { page: 'profile', label: 'Hồ sơ của tôi', icon: UserCircle },
  { page: 'notifications', label: 'Thông báo', icon: Bell },
  { page: 'accounts', label: 'Tài khoản', icon: Key },
  { page: 'authorization', label: 'Phân quyền', icon: ShieldCheck },
  { page: 'configuration', label: 'Cấu hình động', icon: SlidersHorizontal },
  { page: 'templates', label: 'Template', icon: FileText },
  { page: 'preferences', label: 'Kênh nhận', icon: SlidersHorizontal },
] as const

function pageFromHash(): AdminPage {
  const page = window.location.hash.replace(/^#/, '').split('?')[0] as AdminPage
  return page in pageTitles ? page : 'overview'
}

function AuthenticatedApp({ config, accessToken }: AppProps & { accessToken: string }) {
  const auth = useAuth()
  const profile = useViewer(config.graphqlUrl, accessToken)
  const inbox = useNotificationInbox(config.graphqlUrl, accessToken, profile.viewer?.accountId)
  const displayName = profile.viewer?.displayName ?? auth.user?.profile.preferred_username ?? 'Backoffice'
  const [activePage, setActivePage] = useState<AdminPage>(pageFromHash)
  const [railExpanded, setRailExpanded] = useState(() => window.localStorage.getItem('vistay.admin.rail-expanded') === 'true')

  useEffect(() => {
    const syncPage = () => setActivePage(pageFromHash())
    window.addEventListener('hashchange', syncPage)
    if (!window.location.hash) window.history.replaceState(null, '', '#overview')
    return () => window.removeEventListener('hashchange', syncPage)
  }, [])

  const pageTitle = pageTitles[activePage]

  const toggleRail = () => setRailExpanded((expanded) => {
    const next = !expanded
    window.localStorage.setItem('vistay.admin.rail-expanded', String(next))
    return next
  })

  return (
    <main className={`admin-shell${railExpanded ? ' rail-expanded' : ''}`}>
      <aside className="rail">
        <a className="rail-mark" href="#overview" aria-label="ViStay" title="ViStay">
          <span className="rail-logo-frame" aria-hidden="true">
            <img src={vistayLogo} alt="" />
          </span>
          <span className="rail-wordmark">Vistay</span>
        </a>
        <button
          type="button"
          className="rail-toggle"
          onClick={toggleRail}
          aria-label={railExpanded ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
          aria-expanded={railExpanded}
          title={railExpanded ? 'Thu gọn' : 'Mở rộng'}
        >
          <CaretDoubleRight weight="bold" />
        </button>
        <nav aria-label="Điều hướng chính">
          {navigationItems.map(({ page, label, icon: Icon }) => {
            const active = activePage === page
            return (
              <a
                key={page}
                className={active ? 'active' : ''}
                href={`#${page}`}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                title={label}
              >
                <Icon weight={active ? 'bold' : 'regular'} />
                <span>{label}</span>
                {page === 'notifications' && inbox.unreadCount > 0 && <i>{inbox.unreadCount}</i>}
              </a>
            )
          })}
        </nav>
        <div className="rail-account"><button className="rail-avatar" title={displayName}>{initials(displayName)}</button><span><strong>{displayName}</strong><small>{profile.viewer?.roles[0] ?? 'Backoffice'}</small></span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{pageTitle.eyebrow}</p>
            <h1>{pageTitle.title}</h1>
          </div>
          <div className="topbar-actions"><span className={`connection-chip ${inbox.status}`}><i />{streamLabels[inbox.status]}</span><button className="secondary-button" onClick={() => void auth.signoutRedirect()}>Đăng xuất <SignOut /></button></div>
        </header>

        {profile.status === 'loading' && (
          <section className="inline-state" aria-live="polite"><SpinnerGap className="spinner" />Đang tải hồ sơ từ Federation…</section>
        )}

        {profile.status === 'error' && (
          <section className="inline-state error" role="alert">
            <WarningCircle />
            <div><strong>Không tải được hồ sơ</strong><span>{profile.error}</span></div>
            <button onClick={profile.retry}><ArrowClockwise /> Thử lại</button>
          </section>
        )}

        {profile.viewer && (
          <>
            {activePage === 'overview' && <OverviewDashboard graphqlUrl={config.graphqlUrl} accessToken={accessToken} viewer={profile.viewer} />}
            {activePage === 'analytics' && <AnalyticsDashboard graphqlUrl={config.graphqlUrl} accessToken={accessToken} viewer={profile.viewer} />}
            {activePage === 'inventory' && (
              <InventoryWorkspace graphqlUrl={config.graphqlUrl} accessToken={accessToken} viewer={profile.viewer} />
            )}
            {activePage === 'management' && <PropertyManagement />}

            {activePage === 'profile' && <><section className="signal-grid" aria-label="Trạng thái phiên làm việc">
              <article>
                <span>Danh tính</span>
                <strong>Đã xác minh</strong>
                <small><CheckCircle /> Backoffice Realm</small>
              </article>
              <article>
                <span>Vai trò</span>
                <strong>{profile.viewer.roles.length}</strong>
                <small>{profile.viewer.roles.join(', ') || 'Chưa gán vai trò'}</small>
              </article>
              <article>
                <span>Quyền hiệu lực</span>
                <strong>{profile.viewer.permissions.length}</strong>
                <small>Phiên bản {profile.viewer.authorizationVersion}</small>
              </article>
              <article className={`stream-signal ${inbox.status}`}>
                <span>Luồng thông báo</span>
                <strong>{streamLabels[inbox.status]}</strong>
                <small><WifiHigh /> GraphQL-over-SSE</small>
              </article>
            </section>

            <section className="content-grid">
              <PersonalProfileEditor
                key={profile.viewer.profileVersion}
                graphqlUrl={config.graphqlUrl}
                accessToken={accessToken}
                viewer={profile.viewer}
                onUpdated={profile.retry}
              />

              <SecuritySessions
                authApiUrl={config.authApiUrl}
                accessToken={accessToken}
                viewer={profile.viewer}
                onCurrentRevoked={() => void auth.removeUser()}
              />

            </section></>}

            {activePage === 'notifications' && <NotificationInbox model={inbox} />}

            {activePage === 'accounts' && <><AccountProvisioning
              authApiUrl={config.authApiUrl}
              accessToken={accessToken}
              viewer={profile.viewer}
            />
            <AccountSecurityConsole
              authApiUrl={config.authApiUrl}
              accessToken={accessToken}
              viewer={profile.viewer}
            /></>}
            {activePage === 'authorization' && <AuthorizationConsole
              graphqlUrl={config.graphqlUrl}
              accessToken={accessToken}
              viewer={profile.viewer}
            />}
            {activePage === 'configuration' && <DynamicConfigurationWorkspace graphqlUrl={config.graphqlUrl} accessToken={accessToken} viewer={profile.viewer} />}
            {activePage === 'templates' && <NotificationTemplateWorkspace graphqlUrl={config.graphqlUrl} accessToken={accessToken} />}
            {activePage === 'preferences' && <NotificationPreferences graphqlUrl={config.graphqlUrl} accessToken={accessToken} />}
          </>
        )}
      </section>
    </main>
  )
}

export default function App({ config }: AppProps) {
  const auth = useAuth()
  if (auth.isLoading || auth.activeNavigator) return <LoadingScreen label="Đang xác thực…" />
  if (!auth.isAuthenticated || !auth.user?.access_token) {
    return <LoginScreen error={auth.error?.message} onLogin={() => void auth.signinRedirect()} />
  }
  return <AuthenticatedApp config={config} accessToken={auth.user.access_token} />
}
