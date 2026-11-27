/**
 * Races a promise against a timer, returns a fallback value (without rejecting) when time expires.
 */
export async function timeoutFallback<T, V>(
  promise: Promise<T>,
  value: V,
  timeoutMillis = 2000,
): Promise<T | V> {
  return Promise.race([
    promise,
    new Promise<V>((resolve) => setTimeout(() => resolve(value), timeoutMillis)),
  ]);
}

export async function timeoutError<T>(
  promise: Promise<T>,
  error?: string | Error,
  timeoutMillis = 5000,
): Promise<T> {
  if (typeof error === "string") error = new Error(error);
  return Promise.race<T>([
    promise,
    new Promise((resolve, reject) => {
      setTimeout(() => reject(error || new Error("Operation timed out.")), timeoutMillis);
    }),
  ]);
}
