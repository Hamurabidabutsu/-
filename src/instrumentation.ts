export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    !process.env.NETLIFY &&
    process.env.STORAGE_BACKEND !== "netlify" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { startBackgroundWorkers } = await import("./lib/server");
    await startBackgroundWorkers();
  }
}

