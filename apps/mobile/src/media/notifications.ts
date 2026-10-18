import { tr } from "../i18n";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import { backgroundNotificationLink } from '../logic/notifications';
export const systemPushConfigured = !!Constants.expoConfig?.extra?.eas?.projectId;
export async function localNotificationsAllowed() { return (await Notifications.getPermissionsAsync()).status === 'granted'; }
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound:true, shouldSetBadge:false, shouldShowBanner:true, shouldShowList:true }) });
export async function requestLocalNotifications() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('ds-bot',{name:'DS Bot',importance:Notifications.AndroidImportance.HIGH});
  let permission=await Notifications.getPermissionsAsync();
  if(permission.status !== 'granted')permission=await Notifications.requestPermissionsAsync();
  if(permission.status !== 'granted')throw new Error("Allow system notifications in your phone settings.");
}
export async function registerSystemPush(requestPermission = true) {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error("Cloud push is not configured. Add an EAS project ID and platform credentials, then rebuild the app.");
  if (requestPermission) await requestLocalNotifications();
  else if ((await Notifications.getPermissionsAsync()).status !== 'granted') throw new Error('Notification permission is not granted');
  return (await Notifications.getExpoPushTokenAsync({projectId})).data;
}
export async function foregroundNotification(title:string, data:Record<string,unknown>) {
  if((await Notifications.getPermissionsAsync()).status !== 'granted')return;
  await Notifications.scheduleNotificationAsync({content:{title,body:tr("Open DS Bot to view details"),data,sound:true},trigger:null});
}
export function notificationResponses(callback:(data:Record<string,unknown>)=>void) {
  const subscription=Notifications.addNotificationResponseReceivedListener(response=>callback(response.notification.request.content.data));
  const open = (url:string|null) => { const data=backgroundNotificationLink(url); if(data)callback(data); };
  const links=Linking.addEventListener('url',event=>open(event.url));
  void Linking.getInitialURL().then(open).catch(()=>{});
  void Notifications.getLastNotificationResponseAsync().then(response=>{if(response){callback(response.notification.request.content.data);void Notifications.clearLastNotificationResponseAsync();}});
  return ()=>{subscription.remove();links.remove();};
}
