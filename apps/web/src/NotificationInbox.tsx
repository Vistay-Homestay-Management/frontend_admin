import { useMemo, useState } from 'react'
import {
  mapNotificationReference,
  type Notification,
  type NotificationCategory,
  type NotificationPriority,
} from '@vistay/admin-api-client'
import type { NotificationInboxModel } from './lib/useBackofficeData'

interface NotificationInboxProps {
  model: NotificationInboxModel
}

const categories: (NotificationCategory | 'ALL')[] = [
  'ALL', 'WELCOME', 'SECURITY', 'BOOKING', 'OPERATIONS', 'FINANCE', 'SYSTEM',
]
const priorities: (NotificationPriority | 'ALL')[] = ['ALL', 'URGENT', 'HIGH', 'NORMAL', 'LOW']

const categoryLabels: Record<NotificationCategory | 'ALL', string> = {
  ALL: 'Tat ca',
  WELCOME: 'Chao mung',
  SECURITY: 'Bao mat',
  BOOKING: 'Dat phong',
  OPERATIONS: 'Van hanh',
  FINANCE: 'Tai chinh',
  SYSTEM: 'He thong',
}

const priorityLabels: Record<NotificationPriority | 'ALL', string> = {
  ALL: 'Moi muc do',
  URGENT: 'Khan cap',
  HIGH: 'Cao',
  NORMAL: 'Thuong',
  LOW: 'Thap',
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value))
}

function matchesDate(value: string, from: string, to: string): boolean {
  const day = value.slice(0, 10)
  return (!from || day >= from) && (!to || day <= to)
}

function notificationPriority(notification: Notification): NotificationPriority {
  return notification.priority ?? 'NORMAL'
}

function NotificationRow({
  notification,
  selected,
  onSelect,
}: {
  notification: Notification
  selected: boolean
  onSelect: () => void
}) {
  const route = mapNotificationReference(notification.reference)
  return (
    <button
      aria-current={selected ? 'true' : undefined}
      className={`notification-row ${selected ? 'selected' : ''} ${notification.readAt ? 'read' : 'unread'}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`notification-priority priority-${notificationPriority(notification).toLowerCase()}`}>
        {priorityLabels[notificationPriority(notification)]}
      </span>
      <span className="notification-row-copy">
        <span className="notification-row-topline">
          <span>{categoryLabels[notification.category]}</span>
          <time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time>
        </span>
        <strong>{notification.title}</strong>
        <span>{notification.body}</span>
        <small>{route ? 'Co nguon tham chieu an toan' : 'Thong bao noi bo'}</small>
      </span>
      {!notification.readAt && <span aria-label="Chua doc" className="unread-dot" />}
    </button>
  )
}

function NotificationDetail({
  notification,
  onMarkRead,
}: {
  notification: Notification
  onMarkRead: () => void
}) {
  const route = mapNotificationReference(notification.reference)
  return (
    <article aria-label="Chi tiet thong bao" className="notification-detail">
      <div className="notification-detail-heading">
        <span className={`notification-priority priority-${notificationPriority(notification).toLowerCase()}`}>
          {priorityLabels[notificationPriority(notification)]}
        </span>
        <span>{categoryLabels[notification.category]}</span>
      </div>
      <h3>{notification.title}</h3>
      <time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time>
      <p>{notification.body}</p>
      <dl className="notification-meta">
        <div><dt>Kenh</dt><dd>{notification.channels.join(' · ')}</dd></div>
        {notification.notificationType && <div><dt>Loai</dt><dd>{notification.notificationType}</dd></div>}
        {notification.templateKey && <div><dt>Mau</dt><dd>{notification.templateKey} / v{notification.templateRevision ?? '-'}</dd></div>}
      </dl>
      {route && <a className="notification-reference" href={route}>Mo khu vuc duoc phep</a>}
      {!notification.readAt && <button className="secondary-button" onClick={onMarkRead} type="button">Danh dau da doc</button>}
    </article>
  )
}

export function NotificationInbox({ model }: NotificationInboxProps) {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [category, setCategory] = useState<NotificationCategory | 'ALL'>('ALL')
  const [priority, setPriority] = useState<NotificationPriority | 'ALL'>('ALL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [actionError, setActionError] = useState<string>()

  const filtered = useMemo(() => model.notifications.filter((notification) => (
    (!unreadOnly || !notification.readAt)
      && (category === 'ALL' || notification.category === category)
      && (priority === 'ALL' || notificationPriority(notification) === priority)
      && matchesDate(notification.createdAt, fromDate, toDate)
  )), [category, fromDate, model.notifications, priority, toDate, unreadOnly])

  const selected = filtered.find((notification) => notification.id === selectedId) ?? filtered[0]
  const markRead = async (notification: Notification) => {
    setActionError(undefined)
    try {
      await model.markRead(notification)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Khong the cap nhat thong bao')
    }
  }

  const markAllRead = async () => {
    setActionError(undefined)
    try {
      await model.markAllRead()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Khong the cap nhat thong bao')
    }
  }

  return (
    <section aria-labelledby="notification-inbox-title" className="notification-inbox">
      <header className="inbox-heading">
        <div>
          <p className="eyebrow">DURABLE INBOX</p>
          <h2 id="notification-inbox-title">Thong bao cua ban</h2>
          <p className="inbox-summary">{model.unreadCount} thong bao chua doc · {filtered.length} dang hien thi</p>
        </div>
        <div className="inbox-actions">
          <span className={`live-pill ${model.status}`}><i />{model.status === 'live' ? 'Truc tuyen' : model.status === 'error' ? 'Mat ket noi' : 'Dang dong bo'}</span>
          <button className="secondary-button" disabled={model.unreadCount === 0} onClick={() => void markAllRead()} type="button">Doc tat ca</button>
        </div>
      </header>

      <div aria-label="Bo loc thong bao" className="notification-filters">
        <label className="filter-check"><input checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} type="checkbox" /> Chi chua doc</label>
        <label>Danh muc<select aria-label="Danh muc" value={category} onChange={(event) => setCategory(event.target.value as NotificationCategory | 'ALL')}>
          {categories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}
        </select></label>
        <label>Muc do<select aria-label="Muc do" value={priority} onChange={(event) => setPriority(event.target.value as NotificationPriority | 'ALL')}>
          {priorities.map((value) => <option key={value} value={value}>{priorityLabels[value]}</option>)}
        </select></label>
        <label>Tu ngay<input aria-label="Tu ngay" onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} /></label>
        <label>Den ngay<input aria-label="Den ngay" onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} /></label>
      </div>

      {model.error && <div className="stream-error" role="alert"><span>{model.error}</span><button onClick={model.retry} type="button">Thu lai</button></div>}
      {model.cursorState && model.cursorState !== 'ACTIVE' && <div className="cursor-notice" role="status">Lich su phan trang can dong bo lai ({model.cursorState}).</div>}
      {actionError && <div className="stream-error" role="alert">{actionError}</div>}

      {model.inboxStatus === 'loading' && <div aria-live="polite" className="empty-state">Dang tai thong bao...</div>}
      {model.inboxStatus !== 'loading' && filtered.length === 0 && <div className="empty-state"><h3>Chua co thong bao phu hop</h3><p>Thu doi bo loc hoac ket noi lai de dong bo lich su thong bao.</p></div>}
      {filtered.length > 0 && (
        <div className="notification-inbox-grid">
          <div aria-label="Danh sach thong bao" className="notification-list" role="list">
            {filtered.map((notification) => <NotificationRow key={notification.id} notification={notification} onSelect={() => {
              setSelectedId(notification.id)
              if (!notification.readAt) void markRead(notification)
            }} selected={notification.id === selectedId} />)}
            {model.pageInfo?.hasNextPage && <button className="load-more-button" disabled={model.loadingMore} onClick={() => void model.loadMore()} type="button">{model.loadingMore ? 'Dang tai...' : 'Tai them'}</button>}
          </div>
          {selected && <NotificationDetail notification={selected} onMarkRead={() => void markRead(selected)} />}
        </div>
      )}
    </section>
  )
}
