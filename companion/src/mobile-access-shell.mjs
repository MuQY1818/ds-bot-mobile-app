import { createElement as h, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import css from './mobile-access.css'

function PhoneIcon() {
  return h('svg', { viewBox: '0 0 24 24', width: 21, height: 21, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, 'aria-hidden': true },
    h('rect', { x: 6, y: 2.5, width: 12, height: 19, rx: 3 }), h('path', { d: 'M10 18h4' }))
}

function AccountEntry({ store }) {
  const [container, setContainer] = useState(null)
  useEffect(() => {
    let owned
    const sync = () => {
      const menu = document.querySelector('.bt-account-menu')
      if (owned?.parentElement === menu) return
      owned?.remove(); owned = undefined
      if (menu) {
        owned = document.createElement('div')
        owned.dataset.dsbMobileAccessEntry = 'true'
        owned.style.display = 'contents'
        menu.insertBefore(owned, menu.querySelector('[role=separator]'))
      }
      setContainer(owned ?? null)
    }
    // DS Bot's account menu is a direct body portal, with no public item slot.
    // Watch that boundary only; streamed message DOM is deliberately excluded.
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true })
    sync()
    return () => { observer.disconnect(); owned?.remove() }
  }, [])
  if (!container) return null
  return createPortal(h('button', {
    type: 'button', role: 'menuitem', className: 'dsb-access-menu-entry', onClick() {
      document.querySelector('.bt-account[aria-expanded=true]')?.click()
      store.open()
    },
  }, h(PhoneIcon), h('span', { className: 'bt-menu-label' }, '手机访问')), container)
}

function ProviderContent({ provider }) { return provider.render() }

function AccessDialog({ store, state }) {
  const root = useRef(null), closeButton = useRef(null), tabs = useRef(null)
  const uid = useId()
  const active = state.providers.find(provider => provider.id === state.activeId)
  useEffect(() => {
    const previous = document.activeElement
    closeButton.current?.focus()
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); store.close(); return
      }
      if (event.key !== 'Tab' || !root.current) return
      const controls = [...root.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"])')]
        .filter(node => node.tabIndex >= 0 && node.getClientRects().length && !node.closest('[inert],[hidden]'))
      const first = controls[0], last = controls.at(-1)
      if (!root.current.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus()
      }
    }
    const onFocus = event => {
      if (root.current && !root.current.contains(event.target)) closeButton.current?.focus()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus)
      if (previous?.isConnected && previous !== document.body) previous.focus()
      else document.querySelector('.bt-account')?.focus()
    }
  }, [store])
  const onTabKey = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    const all = [...tabs.current.querySelectorAll('[role=tab]')]
    const current = Math.max(0, all.indexOf(event.target))
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? all.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length
    const provider = state.providers[next]
    if (provider) { store.select(provider.id); all[next]?.focus() }
  }
  return createPortal(h('div', {
    className: 'dsb-access-backdrop', onMouseDown(event) { if (event.target === event.currentTarget) store.close() },
  }, h('section', { ref: root, className: 'dsb-access-dialog', role: 'dialog', 'aria-modal': true, 'aria-labelledby': `${uid}-heading`, 'aria-describedby': `${uid}-description` },
    h('header', { className: 'dsb-access-heading' },
      h('div', null, h(PhoneIcon), h('h1', { id: `${uid}-heading` }, '手机访问')),
      h('button', { ref: closeButton, type: 'button', className: 'dsb-access-close', 'aria-label': '关闭手机访问', onClick: () => store.close() },
        h('svg', { viewBox: '0 0 24 24', width: 21, height: 21, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, 'aria-hidden': true }, h('path', { d: 'm6 6 12 12M18 6 6 18' })))),
    h('p', { id: `${uid}-description`, className: 'dsb-access-description' }, '在手机上接着聊，继续使用同一支 Bot 团队。'),
    h('div', { ref: tabs, role: 'tablist', 'aria-label': '手机访问方式', className: 'dsb-access-tabs', onKeyDown: onTabKey },
      ...state.providers.map(provider => h('button', {
        key: provider.id, id: `${uid}-tab-${provider.id}`, type: 'button', role: 'tab', 'aria-selected': provider.id === state.activeId,
        'aria-controls': `${uid}-panel`, tabIndex: provider.id === state.activeId ? 0 : -1, onClick: () => store.select(provider.id),
      }, provider.label))),
    h('div', { className: 'dsb-access-body', id: `${uid}-panel`, role: 'tabpanel', 'aria-labelledby': `${uid}-tab-${state.activeId}`, tabIndex: 0 },
      active ? h(ProviderContent, { key: `${active.id}:${active.instance}`, provider: active }) : null))), document.body)
}

function LeaderHost({ store, state }) {
  useEffect(() => {
    const style = document.createElement('style')
    style.dataset.dsbMobileAccess = 'true'; style.textContent = css
    document.head.append(style)
    return () => style.remove()
  }, [])
  return h('div', { className: 'dsb-access-host' }, h(AccountEntry, { store }), state.open ? h(AccessDialog, { store, state }) : null)
}

export function MobileAccessHost({ access }) {
  const state = useSyncExternalStore(access.store.subscribe, access.store.getSnapshot, access.store.getSnapshot)
  if (state.leader !== access.id || !access.isCurrent()) return null
  return h(LeaderHost, { store: access.store, state })
}
