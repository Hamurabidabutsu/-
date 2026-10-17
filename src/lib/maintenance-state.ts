import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { remoteStorage } from "./storage";

const stateStore = () =>
  getStore({
    name:
      process.env.APP_MODE === "demo"
        ? "maintenance-state-demo"
        : "maintenance-state",
    consistency: "strong",
  });
export async function maintenanceState() {
  if (!remoteStorage()) return null;
  const state = await stateStore().getWithMetadata("next", { type: "json" });
  if (state && !state.etag)
    throw new Error("Maintenance state requires an ETag");
  return state as {
    data: { at: number };
    etag: string;
  } | null;
}
// Keep the earliest wake-up, including when two serverless instances overlap.
export async function wakeMaintenance(at = Date.now()) {
  if (!remoteStorage()) return;
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await maintenanceState();
    const result = await stateStore().setJSON(
      "next",
      { at: Math.min(current?.data.at ?? at, at), revision: randomUUID() },
      current ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );
    if (result.modified) return;
  }
  throw new Error("Maintenance wake-up conflicted; retry the request");
}
export async function finishMaintenance(etag: string, at: number | null) {
  // A request may have enqueued new work while this job was running. Do not erase it.
  await stateStore().setJSON(
    "next",
    { at: at ?? Number.MAX_SAFE_INTEGER },
    { onlyIfMatch: etag },
  );
}
