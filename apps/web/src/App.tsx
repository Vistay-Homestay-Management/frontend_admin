import {
  ArrowClockwise,
  Bell,
  CheckCircle,
  Key,
  LockKey,
  ShieldCheck,
  SignOut,
  SpinnerGap,
  UserCircle,
  WarningCircle,
  WifiHigh,
} from '@phosphor-icons/react'
import { useAuth } from 'react-oidc-context'
import type { Notification } from '@vistay/admin-api-client'
import './App.css'
import { AuthorizationConsole } from './AuthorizationConsole'
import { AccountProvisioning } from './AccountProvisioning'
import { SecuritySessions } from './SecuritySessions'
import { PersonalProfileEditor } from './PersonalProfileEditor'
import type { RuntimeConfig } from './lib/config'
import { useNotificationStream, useViewer, type StreamStatus } from './lib/useBackofficeData'

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

function NotificationItem({ notification }: { notification: Notification }) {
  const createdAt = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(notification.createdAt))

  return (
    <article className="notification-card">
      <div className={`notification-icon ${notification.category.toLowerCase()}`}>
        {notification.category === 'SECURITY' ? <LockKey /> : <CheckCircle />}
      </div>
      <div className="notification-copy">
        <div><span>{notification.category === 'SECURITY' ? 'Bảo mật' : 'Chào mừng'}</span><time>{createdAt}</time></div>
        <h3>{notification.title}</h3>
        <p>{notification.body}</p>
        <small>{notification.channels.join(' · ')}</small>
      </div>
    </article>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase()
}

function AuthenticatedApp({ config, accessToken }: AppProps & { accessToken: string }) {
  const auth = useAuth()
  const profile = useViewer(config.graphqlUrl, accessToken)
  const stream = useNotificationStream(config.graphqlUrl, accessToken, profile.viewer?.accountId)
  const displayName = profile.viewer?.displayName ?? auth.user?.profile.preferred_username ?? 'Backoffice'

  return (
    <main className="admin-shell">
      <aside className="rail">
        <a className="rail-mark" href="/" aria-label="ViStay">V<span>.</span></a>
        <nav aria-label="Điều hướng chính">
          <a className="active" href="#profile"><UserCircle /><span>Hồ sơ</span></a>
          <a href="#authorization"><ShieldCheck /><span>Phân quyền</span></a>
          <a href="#notifications"><Bell /><span>Thông báo</span></a>
          <a href="#accounts"><Key /><span>Tài khoản</span></a>
        </nav>
        <button className="rail-avatar" title={displayName}>{initials(displayName)}</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">TRUNG TÂM VẬN HÀNH</p>
            <h1>Xin chào, {displayName}.</h1>
          </div>
          <button className="secondary-button" onClick={() => void auth.signoutRedirect()}>
            Đăng xuất <SignOut />
          </button>
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
            <section className="signal-grid" aria-label="Trạng thái phiên làm việc">
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
              <article className={`stream-signal ${stream.status}`}>
                <span>Luồng thông báo</span>
                <strong>{streamLabels[stream.status]}</strong>
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

              <section className="notification-section" id="notifications">
                <div className="section-heading">
                  <div><p className="eyebrow">DURABLE INBOX</p><h2>Thông báo của bạn</h2></div>
                  <span className={`live-pill ${stream.status}`}><i />{streamLabels[stream.status]}</span>
                </div>

                {stream.error && (
                  <div className="stream-error" role="alert">
                    <span>{stream.error}</span>
                    <button onClick={stream.reconnect}><ArrowClockwise /> Kết nối lại</button>
                  </div>
                )}

                {stream.notifications.length === 0 ? (
                  <div className="empty-state">
                    <Bell weight="duotone" />
                    <h3>Chưa có thông báo mới</h3>
                    <p>Thông báo chào mừng và cảnh báo bảo mật sẽ xuất hiện tại đây. Cursor được lưu để tiếp tục sau khi kết nối lại.</p>
                  </div>
                ) : (
                  <div className="notification-list">
                    {stream.notifications.map((notification) => <NotificationItem key={notification.id} notification={notification} />)}
                  </div>
                )}
              </section>
            </section>
            <AccountProvisioning
              authApiUrl={config.authApiUrl}
              accessToken={accessToken}
              viewer={profile.viewer}
            />
            <AuthorizationConsole
              graphqlUrl={config.graphqlUrl}
              accessToken={accessToken}
              viewer={profile.viewer}
            />
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
