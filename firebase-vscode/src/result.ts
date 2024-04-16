/** A wrapper object used to differentiate between error and value state.
 *
 * It has the added benefit of enabling the differentiation of "no value yet"
 * from "value is undefined".
 */
export abstract class Result<T> {
  /** Run a block of code and converts the result in a Result.
   *
   * Errors will be caught, logged and returned as an error.
   */
  static guard<T>(cb: () => Promise<T>): Promise<Result<T>>;
  static guard<T>(cb: () => T): Result<T>;
  static guard<T>(cb: () => T | Promise<T>): Result<T> | Promise<Result<T>> {
    try {
      const value = cb();
      if (value instanceof Promise) {
        return value
          .then<Result<T>>((value) => new ResultValue(value))
          .catch((error) => new ResultError(error));
      }

      return new ResultValue(value);
    } catch (error: any) {
      return new ResultError(error);
    }
  }

  get tryReadValue(): T | undefined {
    return this.switchCase(
      (value) => value,
      () => undefined,
    );
  }

  get requireValue(): T {
    return this.switchCase(
      (value) => value,
      (error) => {
        throw new Error("Result in error state", {
          cause: error,
        });
      },
    );
  }

  switchCase<NewT>(
    value: (value: T) => NewT,
    error: (error: unknown) => NewT,
  ): NewT {
    const that: unknown = this;
    if (that instanceof ResultValue) {
      return value(that.value);
    }

    return error((that as ResultError<T>).error);
  }

  follow<NewT>(cb: (prev: T) => Result<NewT>): Result<NewT> {
    return this.switchCase(
      (value) => cb(value),
      (error) => new ResultError(error),
    );
  }

  followAsync<NewT>(
    cb: (prev: T) => Promise<Result<NewT>>,
  ): Promise<Result<NewT>> {
    return this.switchCase<Promise<Result<NewT>>>(
      (value) => cb(value),
      async (error) => new ResultError(error),
    );
  }
}

export class ResultValue<T> extends Result<T> {
  constructor(readonly value: T) {
    super();
  }
}

export class ResultError<T> extends Result<T> {
  constructor(readonly error: unknown) {
    super();
  }
}
