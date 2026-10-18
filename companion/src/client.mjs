import { createElement as h, useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import QRCode from 'qrcode'
import { createOperatorClient } from './operator-client.mjs'
import { createDeviceController } from './controller.mjs'
import css from './style.css'
import { registerMobileAccessProvider } from './mobile-access-registry.mjs'
import { MobileAccessHost } from './mobile-access-shell.mjs'

export const inject = ['slots']
function PairingQR({ data }) {
  const qr = useMemo(() => QRCode.create(JSON.stringify(data), { errorCorrectionLevel: 'M' }), [data])
  const n = qr.modules.size, cells = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) cells.push(`M${x+4} ${y+4}h1v1h-1z`)
  return h('svg', { className: 'dsma-qr', viewBox: `0 0 ${n+8} ${n+8}`, role: 'img', 'aria-label': 'App 设备配对二维码', shapeRendering: 'crispEdges' }, h('rect', { width: n+8, height: n+8, fill: '#fff' }), h('path', { d: cells.join(''), fill: '#000' }))
}
function DeviceIcon({ refresh = false }) {
  return h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
    refresh ? h('path', { d: 'M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9', strokeLinecap: 'round', strokeLinejoin: 'round' }) : h('rect', { x: 6, y: 2.5, width: 12, height: 19, rx: 3 }),
    !refresh ? h('path', { d: 'M10 18h4', strokeLinecap: 'round' }) : null)
}
export function DevicesPage({ controller }) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot)
  const [showManual, setShowManual] = useState(false)
  useEffect(() => {
    void controller.refresh()
    const timer = setInterval(() => { controller.tick(); if (!document.hidden) void controller.refresh() }, 3000)
    const visibility = () => { if (!document.hidden) void controller.refresh() }
    const hide = () => controller.clearPairing()
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', hide)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', hide); controller.clearPairing() }
  }, [controller])
  const status = state.status, enabled = status?.enabled === true
  const devices = (status?.devices ?? []).filter(item => !item.revokedAt), pending = status?.pending ?? []
  return h('section', { className: 'dsma-page', 'aria-label': 'App 连接与设备管理' },
    h('div', { className: 'dsma-state-row' }, h('span', { className: 'dsma-state', 'data-ready': enabled, role: 'status' }, h('i', { 'aria-hidden': true }), enabled ? '连接服务已就绪' : state.error ? '暂时无法连接' : status ? '等待配置' : '正在检查连接…'), h('button', { type: 'button', className: 'dsma-icon-button', disabled: state.busy, onClick: controller.refresh, 'aria-label': '刷新设备状态' }, h(DeviceIcon, { refresh: true }))),
    state.error ? h('p', { className: 'dsma-error', role: 'alert' }, state.error) : null,
    !enabled ? h('div', { className: 'dsma-setup' }, h('h3', null, '准备 App 连接'), h('p', null, '先启用 Mobile Bridge，并设置手机可访问的 HTTPS 地址。'), h('a', { href: 'https://github.com/MuQY1818/ds-bot-mobile-app/blob/main/docs/installation.md', target: '_blank', rel: 'noreferrer' }, '查看设置指南')) :
    h('div', null,
      h('div', { className: 'dsma-add' }, h('div', { className: 'dsma-section-head' }, h('h3', null, '连接 App'), !state.pairing ? h('button', { type: 'button', className: 'dsma-primary', disabled: state.busy, onClick: controller.create }, state.busy ? '正在生成…' : '生成配对二维码') : null),
        h('p', null, '用手机 App 扫码，再在电脑上批准连接。'),
        state.pairing ? h('div', { className: 'dsma-pairing' }, h(PairingQR, { data: state.pairing }), h('p', null, '配对码两分钟内有效'), h('div', { className: 'dsma-actions' }, h('button', { type: 'button', onClick: () => controller.copy(navigator.clipboard) }, state.copied ? '已复制配对资料' : '复制配对资料'), h('button', { type: 'button', className: 'dsma-text-button', onClick: () => { controller.clearPairing(); setShowManual(false) } }, '收起')), h('details', { open: showManual, onToggle: event => setShowManual(event.currentTarget.open) }, h('summary', null, '手动配对'), showManual ? h('textarea', { readOnly: true, 'aria-label': '手动配对 JSON', value: JSON.stringify(state.pairing) }) : null)) : null),
      pending.length ? h('div', { className: 'dsma-section' }, h('h3', null, '待批准请求'), ...pending.map(item => h('div', { className: 'dsma-device', key: item.requestId }, h('span', { className: 'dsma-device-icon' }, h(DeviceIcon)), h('div', { className: 'dsma-device-copy' }, h('strong', null, item.deviceName), h('small', null, '核对设备名称后批准')), h('div', { className: 'dsma-actions' }, h('button', { type: 'button', className: 'dsma-primary', disabled: state.busy, onClick: () => controller.decide(item.requestId, true) }, '批准'), h('button', { type: 'button', disabled: state.busy, onClick: () => controller.decide(item.requestId, false) }, '拒绝'))))) : null,
      h('div', { className: 'dsma-section' }, h('h3', null, '已授权设备', h('span', { className: 'dsma-count' }, devices.length)), ...devices.map(item => h('div', { className: 'dsma-device', key: item.id }, h('span', { className: 'dsma-device-icon' }, h(DeviceIcon)), h('div', { className: 'dsma-device-copy' }, h('strong', null, item.name), h('small', null, item.lastSeenAt ? '最近连接 '+new Date(item.lastSeenAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '等待首次连接')), state.confirmRevoke === item.id ? h('div', { className: 'dsma-confirm', role: 'group', 'aria-label': '确认撤销设备' }, h('p', null, '此设备将需要重新配对。'), h('div', { className: 'dsma-actions' }, h('button', { type: 'button', className: 'dsma-danger', disabled: state.busy, onClick: () => controller.revoke(item.id) }, '确认撤销'), h('button', { type: 'button', onClick: controller.cancelRevoke }, '取消'))) : h('button', { type: 'button', className: 'dsma-text-button', disabled: state.busy, onClick: () => controller.confirmRevoke(item.id), 'aria-label': '撤销 '+item.name+' 的访问' }, '撤销'))), !devices.length ? h('p', { className: 'dsma-empty' }, '还没有已连接的手机。') : null),
      h('details', { className: 'dsma-notes' }, h('summary', null, '配对说明'), h('p', null, 'App 配对码与 Web 登录码用途不同。仅向自己的设备提供配对资料，扫码后仍需电脑批准。收起二维码不会撤销已复制的资料；新码会替换未使用的旧码。'))))
}
export function DevicesEntry({ createController }) {
  const [controller, setController] = useState(null)
  useEffect(() => {
    const owned = createController()
    setController(owned)
    return () => owned.dispose()
  }, [createController])
  return controller ? h(DevicesPage, { controller }) : null
}
export function CompanionSettings({ access }) {
  return h('div', { className: 'dsma-page' }, h('p', null, '通过统一手机访问入口配对 App，并管理已授权设备。'), h('button', { type: 'button', onClick: access.open }, '打开手机访问'))
}
export function apply(ctx) {
  const controllers = new Set()
  const createController = () => {
    const controller = createDeviceController({ call: createOperatorClient({ root: new URL('./', location.href).href }) })
    const dispose = controller.dispose
    controller.dispose = () => { controllers.delete(controller); dispose() }
    controllers.add(controller)
    return controller
  }
  const access = registerMobileAccessProvider({ id: 'app', label: 'App', order: 20, render: () => h(DevicesEntry, { createController }) })
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = css; document.head.append(style)
    return () => { access.dispose(); style.remove(); for (const controller of controllers) controller.dispose(); controllers.clear() }
  })
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'ds-bot-mobile-app-access', order: 42, inject: () => ({ access }) }, MobileAccessHost))
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'ds-bot-mobile-app', inject: () => ({ access }) }, CompanionSettings))
}
