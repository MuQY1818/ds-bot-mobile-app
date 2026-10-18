import type { Conversation } from '@ds-bot/mobile-sdk';
import type { TeamPage } from '../screens/TeamScreen';
import type { SettingsPage } from '../screens/SettingsScreen';

export type Route =
  | { page: 'home' }
  | { page: 'chat'; id?: string }
  | { page: 'team'; section: 'bots' | 'groups'; id?: string; create?: 'bot' | 'group'; subpage?: TeamPage }
  | { page: 'settings'; initial?: SettingsPage }
  | { page: 'agent' };

// Keep these destinations stable while the host refreshes its capabilities.
export const mainDestinations = [
  { id: 'home', label: '会话', icon: 'chat', route: { page: 'home' } },
  { id: 'team', label: '团队', icon: 'bots', route: { page: 'team', section: 'bots' } },
  { id: 'settings', label: '设置', icon: 'settings', route: { page: 'settings' } },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: string; route: Route }>;

export function showMainNavigation(route: Route): boolean {
  return route.page === 'home';
}

export function chatReturnRoute(route: Route): Route {
  return route.page === 'chat' || (route.page === 'team' && route.create)
    ? { page: 'home' }
    : route;
}

export function teamChatOrigin(id: string, roomIds: string[]): Route {
  const roomId = roomIds.find(room => id === room || id === `room:${room}`);
  return roomId
    ? { page: 'team', section: 'groups', id: roomId }
    : { page: 'team', section: 'bots', id: id.replace(/^bot:/, '') };
}

export function routeBack(route: Route, chatOrigin: Route): Route {
  return route.page === 'chat' ? chatReturnRoute(chatOrigin) : { page: 'home' };
}

export function selectConversation(
  conversations: Conversation[], selected: string, classic: boolean, chiefSession?: string,
): Conversation | undefined {
  return conversations.find(item => item.id === selected)
    || (classic
      ? conversations.find(item => item.kind === 'agent')
      : (chiefSession ? conversations.find(item => item.sessionId === chiefSession) : undefined) || conversations[0]);
}
