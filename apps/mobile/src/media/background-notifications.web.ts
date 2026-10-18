import type { MobileClient } from '@ds-bot/mobile-sdk';
import type { BackgroundStatus } from './background-notifications';
export const backgroundNotificationsAvailable = false;
export async function backgroundNotificationStatus():Promise<BackgroundStatus> { return {running:false,state:'unavailable'}; }
export async function startBackgroundNotifications(_client:MobileClient,_serverId:string) { throw new Error("Background reception requires the native Android or iOS app."); }
export async function stopBackgroundNotifications(_client?:MobileClient) {}
export async function advanceBackgroundCursor(_serverId:string,_cursor:number) {}

export async function syncBackgroundLanguage() {}
