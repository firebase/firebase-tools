let cleanupFunctions: (() => Promise<void>)[] = [];

export function addCleanup(fn: () => Promise<void>) {
  cleanupFunctions.push(fn);
}

export async function runCleanup() {
  if (cleanupFunctions.length > 0) {
    console.log(`Running global cleanup for ${cleanupFunctions.length} items...`);
    const results = await Promise.allSettled(cleanupFunctions.map((fn) => fn()));
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Error during cleanup:", result.reason);
      }
    }
    cleanupFunctions = [];
  }
}
