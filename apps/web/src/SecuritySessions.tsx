import { useCallback, useEffect, useState } from 'react'
import {
  fetchBackofficeSessions,
  revokeBackofficeSession,
  type BackofficeSession,
  type BackofficeViewer,
} from '@vistay/admin-api-client'

interface SecuritySessionsProps {
  authApiUrl: string
  accessToken: string
  viewer: BackofficeViewer
  onCurrentRevoked: () => void
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function SecuritySessions({
  authApiUrl,
  accessToken,
  viewer,
  onCurrentRevoked,
}: SecuritySessionsProps) {
  const [sessions, setSessions] = useState<BackofficeSession[]>([])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string>()
  const [error, setError] = useState<string>()

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(undefined)
    try {
      setSessions(await fetchBackofficeSessions(
        authApiUrl, accessToken, viewer.accountId, signal,
      ))
    } catch (failure) {
      if (signal?.aborted) return
      setError(failure instanceof Error ? failure.message : 'Không thể tải phiên hoạt động.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [accessToken, authApiUrl, viewer.accountId])

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => load(controller.signal))
    return () => controller.abort()
  }, [load])

  async function revoke(session: BackofficeSession) {
    if (reason.trim().length < 8 || revoking) return
    setRevoking(session.id)
    setError(undefined)
    try {
      await revokeBackofficeSession(
        authApiUrl,
        accessToken,
        viewer.accountId,
        session.id,
        reason.trim(),
        crypto.randomUUID(),
      )
      setSessions((current) => current.filter((item) => item.id !== session.id))
      setReason('')
      if (session.current) onCurrentRevoked()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể thu hồi phiên.')
    } finally {
      setRevoking(undefined)
    }
  }

  return (
    <section className="session-console" id="security">
      <div className="session-heading">
        <div>
          <p className="eyebrow">KEYCLOAK SESSION CONTROL</p>
          <h2>Thiết bị đang đăng nhập</h2>
          <p>Refresh token được xoay vòng. Quên mật khẩu và khôi phục tài khoản được xử lý tại màn hình đăng nhập Keycloak.</p>
        </div>
        <button className="session-refresh" disabled={loading} onClick={() => void load()}>
          {loading ? 'Đang tải…' : 'Tải lại'}
        </button>
      </div>

      <label className="session-reason">
        Lý do thu hồi phiên
        <input
          maxLength={500}
          minLength={8}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ví dụ: Thiết bị bị thất lạc"
          value={reason}
        />
      </label>
      {error && <p className="session-error" role="alert">{error}</p>}

      <div className="session-list">
        {!loading && sessions.length === 0 && <p className="session-empty">Không còn phiên Keycloak đang hoạt động.</p>}
        {sessions.map((session) => (
          <article key={session.id} className={session.current ? 'current' : undefined}>
            <div>
              <span>{session.current ? 'PHIÊN HIỆN TẠI' : 'PHIÊN KHÁC'}</span>
              <strong>{session.ipAddress || 'Không rõ địa chỉ IP'}</strong>
              <small>Truy cập cuối {dateTime(session.lastAccessAt)} · Bắt đầu {dateTime(session.startedAt)}</small>
              <small>{Object.values(session.clients).join(' · ') || 'Backoffice client'}</small>
            </div>
            <button
              disabled={reason.trim().length < 8 || Boolean(revoking)}
              onClick={() => void revoke(session)}
            >
              {revoking === session.id ? 'Đang thu hồi…' : 'Thu hồi'}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
