import { act } from 'react'
import { createRoot } from 'test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationTemplateWorkspace } from './NotificationTemplateWorkspace'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const templateMocks = vi.hoisted(() => ({
  fetchNotificationTemplates: vi.fn(),
  previewNotificationTemplate: vi.fn(),
  publishNotificationTemplate: vi.fn(),
  retireNotificationTemplate: vi.fn(),
  saveNotificationTemplateDraft: vi.fn(),
}))

vi.mock('@vistay/admin-api-client', () => templateMocks)

function renderedText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(renderedText).join('')
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedText((node as { children?: unknown }).children ?? [])
  }
  return ''
}

function findByText(renderer: ReturnType<typeof createRoot>, type: string, value: string) {
  return renderer.container.queryAll((instance) => instance.type === type && renderedText(instance.toJSON()).includes(value))[0]
}

const template = {
  id: 'template-1', templateKey: 'security.alert', channel: 'EMAIL', locale: 'vi-VN', status: 'DRAFT', revision: 2,
  policyRevision: 4, requiredVariables: ['name'], subject: 'Security alert', body: 'Hello {{name}}', immutable: false,
  createdAt: '2026-11-04T00:00:00Z', publishedAt: null, retiredAt: null,
}

async function renderWorkspace() {
  const renderer = createRoot()
  await act(async () => {
    renderer.render(<NotificationTemplateWorkspace graphqlUrl="/graphql" accessToken="token" />)
    await Promise.resolve()
    await Promise.resolve()
  })
  return renderer
}

describe('Admin notification template workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    templateMocks.fetchNotificationTemplates.mockResolvedValue({
      nodes: [template],
      pageInfo: { hasNextPage: false, endCursor: null, startCursor: null, cursorState: 'ACTIVE', retainedFrom: null, reconcileFrom: null },
    })
    templateMocks.previewNotificationTemplate.mockResolvedValue({
      templateKey: 'security.alert', channel: 'EMAIL', locale: 'vi-VN', revision: 2, subject: 'Preview', body: 'Synthetic body',
    })
    templateMocks.saveNotificationTemplateDraft.mockResolvedValue(template)
  })

  it('renders revision diff and uses synthetic values for preview', async () => {
    const renderer = await renderWorkspace()
    expect(renderedText(renderer.container.toJSON())).toContain('security.alert')
    expect(renderedText(renderer.container.toJSON())).toContain('VERSION DIFF')

    const preview = findByText(renderer, 'button', 'Preview tong hop')
    await act(async () => {
      await preview?.props.onClick()
      await Promise.resolve()
    })

    expect(templateMocks.previewNotificationTemplate).toHaveBeenCalledWith('/graphql', 'token', expect.objectContaining({
      variables: [{ name: 'name', value: 'sample-name' }],
    }))
    expect(renderedText(renderer.container.toJSON())).toContain('Synthetic body')
    expect(renderedText(renderer.container.toJSON())).toContain('synthetic variables only')
    await act(async () => renderer.unmount())
  })

  it('blocks invalid variable names before save', async () => {
    const renderer = await renderWorkspace()
    const variableInput = renderer.container.queryAll((instance) => instance.type === 'input' && instance.props.placeholder === 'name, bookingId')[0]
    await act(async () => variableInput?.props.onChange({ target: { value: 'bad variable' } }))
    const save = findByText(renderer, 'button', 'Luu draft')
    await act(async () => save?.props.onClick())

    expect(renderedText(renderer.container.toJSON())).toContain('Ten bien khong hop le')
    expect(templateMocks.saveNotificationTemplateDraft).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })

  it('surfaces stale draft failures without replacing the selected revision', async () => {
    templateMocks.saveNotificationTemplateDraft.mockRejectedValueOnce(new Error('STALE_REVISION'))
    const renderer = await renderWorkspace()
    const save = findByText(renderer, 'button', 'Luu draft')
    await act(async () => {
      await save?.props.onClick()
      await Promise.resolve()
    })

    expect(renderedText(renderer.container.toJSON())).toContain('STALE_REVISION')
    expect(renderedText(renderer.container.toJSON())).toContain('DRAFT / REVISION 2')
    expect(renderedText(renderer.container.toJSON())).toContain('security.alert')
    await act(async () => renderer.unmount())
  })

  it('requires explicit publication confirmation', async () => {
    const renderer = await renderWorkspace()
    const publish = findByText(renderer, 'button', 'Publish revision')
    await act(async () => publish?.props.onClick())
    expect(renderedText(renderer.container.toJSON())).toContain('Xac nhan publication revision')
    expect(templateMocks.publishNotificationTemplate).not.toHaveBeenCalled()
    await act(async () => renderer.unmount())
  })
})
