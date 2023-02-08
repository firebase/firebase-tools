/**
 * Provides typical Deferred Promise that is unfortunately not available in
 * VSCode environment by default.
 */
export class Deferred<T> {
  private readonly promiseObject: Promise<T>;
  private resolveCallback?: (val: T) => void;
  private rejectCallback?: (reason: any) => void;

  constructor() {
    this.promiseObject = new Promise<T>((resolve, reject) => {
      this.resolveCallback = resolve;
      this.rejectCallback = reject;
    });
  }

  resolve(val: T) {
    this.resolveCallback!(val);
    return;
  }

  reject(reason: any) {
    this.rejectCallback!(reason);
  }

  get promise() {
    return this.promiseObject;
  }
}
