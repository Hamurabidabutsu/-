import {
  maintenanceState,
  finishMaintenance,
} from "../../src/lib/maintenance-state";
import { runMaintenance, nextMaintenanceTime } from "../../src/lib/server";

export default async () => {
  const state = await maintenanceState();
  if (!state || state.data.at > Date.now()) return;
  await runMaintenance();
  await finishMaintenance(state.etag, await nextMaintenanceTime());
};
export const config = { schedule: "@hourly" };
