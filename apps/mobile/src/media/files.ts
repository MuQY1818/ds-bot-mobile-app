import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { blobBytes } from "../logic/blob";

export function downloadName(value: string) {
  return value.split(/[\\/]/).at(-1)?.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 120) || "download";
}

export async function saveDownload(name: string, value: Blob | string, mediaType = "application/octet-stream") {
  if (Platform.OS === "web") {
    const blob = typeof value === "string" ? new Blob([value], { type: mediaType }) : value;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName(name);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error("File sharing is unavailable on this device.");
  const file = new File(Paths.cache, Date.now() + "-" + downloadName(name));
  try {
    if (typeof value === "string") file.write(value);
    else file.write(new Uint8Array(await blobBytes(value)));
    await Sharing.shareAsync(file.uri, { mimeType: typeof value === "string" ? mediaType : value.type || mediaType, dialogTitle: downloadName(name) });
  } finally {
    if (file.exists) file.delete();
  }
}
