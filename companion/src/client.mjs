import { createElement as h, useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import QRCode from 'qrcode'
import { createOperatorClient } from './operator-client.mjs'
import { createDeviceController } from './controller.mjs'
import css from './style.css'

export const inject = ['slots']
function PairingQR({ data }) {
  const qr = useMemo(() => QRCode.create(JSON.stringify(data), { errorCorrectionLevel: 'M' }), [data])
  const n = qr.modules.size, cells = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y, x)) cells.push(`M${x+4} ${y+4}h1v1h-1z`)
  return h('svg', { className: 'dsma-qr', viewBox: `0 0 ${n+8} ${n+8}`, role: 'img', 'aria-label': 'App 设备配对二维码', shapeRendering: 'crispEdges' }, h('rect', { width: n+8, height: n+8, fill: '#fff' }), h('path', { d: cells.join(''), fill: '#000' }))
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
  return h('section', { className: 'dsma-page', 'aria-label': 'DS Bot Mobile App 设备管理' },
    h('div', { className: 'dsma-heading' }, h('div', null, h('h2', null, '连接你的手机'), h('p', null, '配对原生 App，在手机上继续使用同一支 Bot 团队。')), h('span', { className: 'dsma-badge', 'data-ready': enabled, role: 'status' }, enabled ? 'Bridge 已连接' : state.error ? 'Bridge 未连接' : status ? '等待配置' : '正在检查')),
    state.error ? h('p', { className: 'dsma-error', role: 'alert' }, state.error) : null,
    !enabled ? h('div', { className: 'dsma-card' }, h('h3', null, '先准备 Mobile Bridge'), h('p', null, '安装并配置独立的 DS Bot Mobile Bridge，设置专用存储和已准备好的 HTTPS 入口。此插件负责配对界面，Bridge 负责设备认证与消息传输。'), h('a', { href: 'https://github.com/MuQY1818/ds-bot-mobile-app/blob/main/docs/installation.md', target: '_blank', rel: 'noreferrer' }, '查看安装与配置指南'), h('button', { type: 'button', onClick: controller.refresh }, '重新检查')) :
    h('div', null,
      h('div', { className: 'dsma-card' }, h('h3', null, '添加设备'), h('p', null, '生成配对码后，用原生 App 扫描。确认下方设备名称后，再批准连接。'),
        state.pairing ? h('div', { className: 'dsma-pairing' }, h(PairingQR, { data: state.pairing }), h('p', null, '二维码仅用于你的手机；两分钟后失效。'), h('div', { className: 'dsma-actions' }, h('button', { type: 'button', onClick: () => controller.copy(navigator.clipboard) }, state.copied ? '已复制配对资料' : '复制配对资料'), h('button', { type: 'button', onClick: () => { controller.clearPairing(); setShowManual(false) } }, '隐藏二维码')), h('details', { open: showManual, onToggle: event => setShowManual(event.currentTarget.open) }, h('summary', null, '手动配对资料'), showManual ? h('textarea', { readOnly: true, 'aria-label': '手动配对 JSON', value: JSON.stringify(state.pairing) }) : null)) : h('button', { type: 'button', className: 'dsma-primary', disabled: state.busy, onClick: controller.create }, state.busy ? '正在生成…' : '生成配对二维码')),
      h('div', { className: 'dsma-card' }, h('h3', null, '待批准请求'), ...(status.pending ?? []).map(item => h('div', { className: 'dsma-device', key: item.requestId }, h('strong', null, item.deviceName), h('span', null, '请核对这是你的设备'), h('div', { className: 'dsma-actions' }, h('button', { type: 'button', className: 'dsma-primary', disabled: state.busy, onClick: () => controller.decide(item.requestId, true) }, '批准连接'), h('button', { type: 'button', disabled: state.busy, onClick: () => controller.decide(item.requestId, false) }, '拒绝')))), !status.pending?.length ? h('p', { className: 'dsma-muted' }, '手机扫码后，连接申请会显示在这里。') : null),
      h('div', { className: 'dsma-card' }, h('h3', null, '已授权设备'), ...(status.devices ?? []).filter(item => !item.revokedAt).map(item => h('div', { className: 'dsma-device', key: item.id }, h('strong', null, item.name), h('span', null, item.lastSeenAt ? '最近连接 '+new Date(item.lastSeenAt).toLocaleString() : '等待首次连接'), state.confirmRevoke === item.id ? h('div', { className: 'dsma-confirm', role: 'group', 'aria-label': '确认撤销设备' }, h('p', null, '撤销后，此设备需要重新配对才能访问。'), h('div', { className: 'dsma-actions' }, h('button', { type: 'button', disabled: state.busy, onClick: () => controller.revoke(item.id) }, '确认撤销'), h('button', { type: 'button', onClick: controller.cancelRevoke }, '取消'))) : h('button', { type: 'button', disabled: state.busy, onClick: () => controller.confirmRevoke(item.id) }, '撤销访问'))), !status.devices?.some(item => !item.revokedAt) ? h('p', { className: 'dsma-muted' }, '还没有已授权设备。') : null),
      h('p', { className: 'dsma-footnote' }, '原生 App 使用设备配对。Mobile Web 的登录二维码用于浏览器，两种二维码不可互换。隐藏二维码不会撤销已复制的资料；生成新码会替换未使用的旧码。')),
    h('button', { type: 'button', disabled: state.busy, onClick: controller.refresh }, '刷新设备状态'))
}
export function apply(ctx) {
  const controller = createDeviceController({ call: createOperatorClient({ root: new URL('./', location.href).href }) })
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = css; document.head.append(style)
    return () => { style.remove(); controller.dispose() }
  })
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'ds-bot-mobile-app', inject: () => ({ controller }) }, DevicesPage))
}
