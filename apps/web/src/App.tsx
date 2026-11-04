import {
  ArrowClockwise,
  Bell,
  Buildings,
  CalendarDots,
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
import { AuthorizationConsole } from './AuthorizationConsole'
import { AccountProvisioning } from './AccountProvisioning'
import { SecuritySessions } from './SecuritySessions'
import { PersonalProfileEditor } from './PersonalProfileEditor'
import { AccountSecurityConsole } from './AccountSecurityConsole'
import { InventoryWorkspace } from './InventoryWorkspace'
import { PropertyManagement } from './PropertyManagement'
import { NotificationInbox } from './NotificationInbox'
import { NotificationPreferences } from './NotificationPreferences'
import { NotificationTemplateWorkspace } from './NotificationTemplateWorkspace'
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

type AdminPage = 'overview' | 'inventory' | 'management' | 'profile' | 'notifications' | 'accounts' | 'authorization' | 'templates' | 'preferences'

const pageTitles: Record<AdminPage, { eyebrow: string; title: string }> = {
  overview: { eyebrow: 'THÔNG TIN CHUNG', title: 'Toàn cảnh vận hành' },
  inventory: { eyebrow: 'TRUNG TÂM VẬN HÀNH', title: 'Tồn phòng & sơ đồ căn' },
  management: { eyebrow: 'PROPERTY MASTER / UNIT CATALOG', title: 'Quản lý tòa và căn' },
  profile: { eyebrow: 'HỒ SƠ CÁ NHÂN', title: 'Phiên làm việc của bạn' },
  notifications: { eyebrow: 'DURABLE INBOX', title: 'Thông báo vận hành' },
  accounts: { eyebrow: 'QUẢN TRỊ DANH TÍNH', title: 'Tài khoản Backoffice' },
  authorization: { eyebrow: 'KIỂM SOÁT TRUY CẬP', title: 'Phân quyền ba lớp' },
  templates: { eyebrow: 'TEMPLATE CONTROL PLANE', title: 'Template thông báo' },
  preferences: { eyebrow: 'CHANNEL POLICY', title: 'Kênh nhận thông báo' },
}

function pageFromHash(): AdminPage {
  const page = window.location.hash.replace(/^#/, '').split('?')[0] as AdminPage
  return page in pageTitles ? page : 'inventory'
}

function AuthenticatedApp({ config, accessToken }: AppProps & { accessToken: string }) {
  const auth = useAuth()
  const profile = useViewer(config.graphqlUrl, accessToken)
  const inbox = useNotificationInbox(config.graphqlUrl, accessToken, profile.viewer?.accountId)
  const displayName = profile.viewer?.displayName ?? auth.user?.profile.preferred_username ?? 'Backoffice'
  const [activePage, setActivePage] = useState<AdminPage>(pageFromHash)

  useEffect(() => {
    const syncPage = () => setActivePage(pageFromHash())
    window.addEventListener('hashchange', syncPage)
    if (!window.location.hash) window.history.replaceState(null, '', '#inventory')
    return () => window.removeEventListener('hashchange', syncPage)
  }, [])

  const pageTitle = pageTitles[activePage]

  return (
    <main className="admin-shell">
      <aside className="rail">
        <a className="rail-mark" href="#overview" aria-label="ViStay" title="ViStay"><span className="rail-symbol">V</span><strong>ViStay</strong><small>Admin workspace</small></a>
        <nav aria-label="Điều hướng chính">
          <a className={activePage === 'overview' ? 'active' : ''} href="#overview" aria-label="Thông tin chung" title="Thông tin chung"><SquaresFour /><span>Thông tin chung</span></a>
          <a className={activePage === 'inventory' ? 'active' : ''} href="#inventory" aria-label="Sơ đồ phòng" title="Sơ đồ phòng"><CalendarDots /><span>Sơ đồ phòng</span></a>
          <a className={activePage === 'management' ? 'active' : ''} href="#management" aria-label="Quản lý tòa" title="Quản lý tòa"><Buildings /><span>Quản lý tòa</span></a>
          <a className={activePage === 'profile' ? 'active' : ''} href="#profile" aria-label="Hồ sơ của tôi" title="Hồ sơ của tôi"><UserCircle /><span>Hồ sơ của tôi</span></a>
          <a className={activePage === 'notifications' ? 'active' : ''} href="#notifications" aria-label="Thông báo" title="Thông báo"><Bell /><span>Thông báo</span>{inbox.unreadCount > 0 && <i>{inbox.unreadCount}</i>}</a>
          <a className={activePage === 'accounts' ? 'active' : ''} href="#accounts" aria-label="Tài khoản" title="Tài khoản"><Key /><span>Tài khoản</span></a>
          <a className={activePage === 'authorization' ? 'active' : ''} href="#authorization" aria-label="Phân quyền" title="Phân quyền"><ShieldCheck /><span>Phân quyền</span></a>
          <a className={activePage === 'templates' ? 'active' : ''} href="#templates" aria-label="Template" title="Template"><FileText /><span>Template</span></a>
          <a className={activePage === 'preferences' ? 'active' : ''} href="#preferences" aria-label="Kênh nhận" title="Kênh nhận"><SlidersHorizontal /><span>Kênh nhận</span></a>
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
            {activePage === 'overview' && <>
              <section className="overview-intro">
                <div>
                  <p className="eyebrow">THÔNG TIN CHUNG</p>
                  <h2>Mọi tín hiệu vận hành trong một màn hình.</h2>
                  <p>Theo dõi danh tính, quyền truy cập và luồng thông báo trước khi đi sâu vào lịch phòng.</p>
                </div>
                <SquaresFour aria-hidden />
              </section>
              <section className="signal-grid" aria-label="Tổng quan phiên làm việc">
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
            </>}
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
