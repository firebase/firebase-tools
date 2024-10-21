/**
 * A polyfill for `ReadableStream.prototype[Symbol.asyncIterator]`,
 * aligning as closely as possible to the specification.
 *
 * @see https://streams.spec.whatwg.org/#rs-asynciterator
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream#async_iteration
 */
(ReadableStream.prototype as any).values ??= function (this: any, { preventCancel = false } = {}) {
  const reader = this.getReader();
  return {
    async next() {
      try {
        const result: IteratorResult<unknown, undefined> = await reader.read();
        if (result.done) {
          reader.releaseLock();
        }
        return result;
      } catch (e) {
        reader.releaseLock();
        throw e;
      }
    },
    async return(value: unknown) {
      if (!preventCancel) {
        const cancelPromise = reader.cancel(value);
        reader.releaseLock();
        await cancelPromise;
      } else {
        reader.releaseLock();
      }
      return { done: true, value };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};

(ReadableStream.prototype as any) ??=
(ReadableStream.prototype as any).values;
