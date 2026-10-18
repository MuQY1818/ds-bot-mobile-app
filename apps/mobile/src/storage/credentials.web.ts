import { MemoryTokenStore } from "@ds-bot/mobile-sdk";
// The browser is a development preview; device credentials live only in this tab's memory.
export const tokenStore = new MemoryTokenStore();
