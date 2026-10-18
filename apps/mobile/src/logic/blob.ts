// React Native's Blob uses FileReader; browsers also offer arrayBuffer().
export function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error("This file could not be read."));
    reader.onabort = () => reject(new Error("The request was cancelled."));
    reader.readAsArrayBuffer(blob);
  });
}
