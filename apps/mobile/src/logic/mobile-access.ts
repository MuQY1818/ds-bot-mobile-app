import { supportsMobileAction, type MobileCapabilities } from './mobile-capabilities.ts';

export const BRIDGE_UNAVAILABLE = '当前电脑桥接暂不支持此功能，请在电脑端操作。';

const actionFeatures: Record<string, string> = {
  queue: 'queue', 'queue-remove': 'queue', 'room-progress': 'groupProgress', 'stop-member-work': 'groupManagement',
  'create-room': 'groupManagement', 'update-room': 'groupManagement', 'delete-room': 'groupManagement',
  'create-bot': 'botManagement', 'update-bot': 'botManagement', 'delete-bot': 'botManagement', 'duplicate-bot': 'botManagement',
  'set-main': 'botManagement', 'set-flags': 'conversationManagement', 'set-prefs': 'preferences',
  'add-agent': 'agents', 'agent-session': 'agents', 'agent-archive': 'agents', 'agent-rename': 'agents', 'remove-agent': 'agents',
  'memory-view': 'memory', 'memory-ask': 'memory', 'memory-forget': 'memory',
  schedules: 'schedules', 'schedule-create': 'schedules', 'schedule-delete': 'schedules', usage: 'usage',
  parts: 'historyParts', search: 'search', context: 'search', 'reference-chats': 'references',
  'browser-pages': 'browser', 'browser-control': 'browser', 'browser-read': 'browser',
  efforts: 'modelSelection', folders: 'folders', 'folder-list': 'folders',
  'bot-capability': 'capabilities',
  approvals: 'approvals', 'approval-resolve': 'approvals', 'answer-question': 'questions', 'dismiss-question': 'questions',
};

export function mobileActionAllowed(capabilities: MobileCapabilities | undefined, action: string): boolean {
  const feature = action.startsWith('notifications-') ? 'notifications' : actionFeatures[action] || action.split('-')[0];
  return supportsMobileAction(capabilities, action, feature);
}

// A panel may make several reads on mount. Keep the entire panel out of the tree
// until all of those endpoints are supported, including for restored routes.
const panelActions: Record<string, string[]> = {
  usage: ['usage'], schedules: ['schedules', 'schedule-create', 'schedule-delete'],
  notifications: ['notifications-list', 'notifications-preferences', 'notifications-read'],
  skills: ['skills-list', 'skills-library', 'skills-get', 'skills-save', 'skills-delete'],
  plugins: ['plugins-list', 'plugins-inspect', 'plugins-install', 'plugins-remove', 'plugins-operation', 'plugins-cancel', 'plugins-set-enabled', 'bundle-set-enabled'],
  capabilities: ['bot-capability'], connectors: ['connector-connect', 'connector-retry', 'connector-disconnect'],
  secrets: ['secret-set', 'secret-allow', 'secret-cancel', 'secret-update', 'secret-delete'],
  feedback: ['diagnostics', 'diagnostics-log', 'diagnostics-clear'],
  harness: ['settings-describe', 'settings-update', 'settings-mutate', 'credentials-describe', 'credentials-set', 'credentials-unset'],
  updates: ['update-check', 'update-install', 'dsh-update-install'],
};
export function mobilePanelAllowed(capabilities: MobileCapabilities | undefined, panel: string): boolean {
  if (['index', 'general', 'mobile', 'about'].includes(panel)) return true;
  if (panel === 'tools') return ['skills', 'plugins', 'connectors', 'capabilities'].some(item => mobilePanelAllowed(capabilities, item));
  return !!panelActions[panel]?.every(action => mobileActionAllowed(capabilities, action));
}

export function notificationAccess(capabilities: MobileCapabilities | undefined) {
  const allows = (action: string) => mobileActionAllowed(capabilities, action);
  return {
    list: allows('notifications-list'),
    push: allows('notifications-register') && allows('notifications-unregister'),
    background: allows('notifications-background-register') && allows('notifications-background-unregister'),
  };
}

export function mobileCancelAllowed(capabilities: MobileCapabilities | undefined): boolean {
  if (typeof capabilities?.cancel === 'boolean') return capabilities.cancel;
  return mobileActionAllowed(capabilities, 'queue');
}

export function mobileMediaAllowed(capabilities: MobileCapabilities | undefined, kind: 'images' | 'files' | 'transcription'): boolean {
  return capabilities?.[kind] === true;
}
