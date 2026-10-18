export async function requestLocalNotifications() { throw new Error("Enable system notifications in the Android or iOS app."); }
export async function registerSystemPush(_requestPermission = true): Promise<string> { throw new Error("Cloud push is only available in a configured Android or iOS app."); }
export async function foregroundNotification(_title:string,_data:Record<string,unknown>) {}
export function notificationResponses(_callback:(data:Record<string,unknown>)=>void) { return ()=>{}; }
export const systemPushConfigured = false;
export async function localNotificationsAllowed() { return false; }
