/**
 * An `AsyncIterable` that captures the following metadata during iteration:
 * - `iterations`: the number of times the iterable has been iterated over
 * - `returnValue`: the final return value (if any)
 *
 * Useful when iterating using the `for await ... of` syntax while
 * still being able to access the return value after.
 */
export class AsyncIterableWithMetadata<T, TReturn = unknown> implements AsyncIterable<T> {
  public returnValue: TReturn | undefined = undefined;
  public iterations = 0;

  constructor(private iterable: Iterable<T> | AsyncIterable<T>) {}

  [Symbol.asyncIterator](): AsyncIterator<T> {
    const asyncIterator =
      Symbol.asyncIterator in this.iterable
        ? this.iterable[Symbol.asyncIterator]()
        : this.iterable[Symbol.iterator]();

    this.returnValue = undefined;
    this.iterations = 0;

    return {
      next: async () => {
        const result = await asyncIterator.next();
        if (result.done) {
          this.returnValue = result.value;
        } else {
          this.iterations++;
        }
        return result;
      },
    };
  }
}

export function copy(src: Uint8Array, dst: Uint8Array, offset = 0): number {
  offset = Math.max(0, Math.min(offset, dst.byteLength));
  const dstBytesAvailable = dst.byteLength - offset;
  if (src.byteLength > dstBytesAvailable) {
    src = src.subarray(0, dstBytesAvailable);
  }
  dst.set(src, offset);
  return src.byteLength;
}
