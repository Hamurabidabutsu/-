import { getStore } from "@netlify/blobs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { dataDir, remoteStorage } from "./storage";

const store = () =>
  getStore({
    name:
      process.env.APP_MODE === "demo"
        ? "private-uploads-demo"
        : "private-uploads",
    consistency: "strong",
  });
function localPath(key: string) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error("Invalid storage key");
  return path.join(dataDir(), "uploads", key);
}
export async function putUpload(key: string, bytes: Buffer) {
  if (remoteStorage()) await store().set(key, new Uint8Array(bytes).buffer);
  else await writeFile(localPath(key), bytes, { mode: 0o600 });
}
export async function readUpload(key: string): Promise<Uint8Array | null> {
  if (remoteStorage()) {
    const result = await store().get(key, { type: "arrayBuffer" });
    return result ? new Uint8Array(result) : null;
  }
  try {
    return new Uint8Array(await readFile(localPath(key)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function deleteUpload(key: string) {
  if (remoteStorage()) await store().delete(key);
  else
    try {
      await unlink(localPath(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
}
