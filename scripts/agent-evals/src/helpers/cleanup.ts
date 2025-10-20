let cleanupFunctions: (() => Promise<void>)[] = [];

export function addCleanup(fn: () => Promise<void>) {
  cleanupFunctions.push(fn);
}

export async function runCleanup() {
  if (cleanupFunctions.length > 0) {
    console.log(`Running global cleanup for ${cleanupFunctions.length} items...`);
    for (const cleanupFunc of cleanupFunctions) {
      await cleanupFunc();
    }
    cleanupFunctions = [];
  }
}
