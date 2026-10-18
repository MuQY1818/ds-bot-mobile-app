import * as SecureStore from "expo-secure-store";
import type { Session, TokenStore } from "@ds-bot/mobile-sdk";
const key = "ds-bot.mobile.session";
export const tokenStore: TokenStore = {
  async get() {
    const value = await SecureStore.getItemAsync(key);
    return value ? (JSON.parse(value) as Session) : null;
  },
  async set(value) {
    await SecureStore.setItemAsync(key, JSON.stringify(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async clear() {
    await SecureStore.deleteItemAsync(key);
  },
};
