/** A wrapper object used to differentiate between error and value state.
 *
 * It has the added benefit of enabling the differentiation of "no value yet"
 * from "value is undefined".
 */
export abstract class Result<DataT, ErrorT = unknown> {
  private static wrapError<DataT, ErrorT>(
    error: unknown,
    onError?: (error: unknown) => ErrorT,
  ): ResultError<DataT, ErrorT> {
    if (onError) {
      try {
        return new ResultError(onError(error));
      } catch (error) {
        return Result.wrapError(error, onError);
      }
    }

    return new ResultError(error as ErrorT);
  }

  /** Run a block of code and converts the result in a Result.
   *
   * Errors will be caught, logged and returned as an error.
   */
  static guard<DataT>(cb: () => Promise<DataT>): Promise<Result<DataT>>;
  static guard<DataT, ErrorT = unknown>(
    cb: () => Promise<DataT>,
    onError?: (error: unknown) => ErrorT,
  ): Result<DataT>;
  static guard<DataT, ErrorT = unknown>(
    cb: () => DataT,
    onError?: (error: unknown) => ErrorT,
  ): Result<DataT>;
  static guard<DataT, ErrorT>(
    cb: () => DataT | Promise<DataT>,
    onError?: (error: unknown) => ErrorT,
  ): Result<DataT> | Promise<Result<DataT>> {
    try {
      const value = cb();
      if (value instanceof Promise) {
        return value
          .then<Result<DataT>>((value) => new ResultValue(value))
          .catch((err) => Result.wrapError(err, onError));
      }

      return new ResultValue(value);
    } catch (error: unknown) {
      return Result.wrapError(error, onError);
    }
  }

  get tryReadValue(): DataT | undefined {
    return this.switchCase(
      (value) => value,
      () => undefined,
    );
  }

  get requireValue(): DataT {
    return this.switchCase(
      (value) => value,
      (error) => {
        throw error;
      },
    );
  }

  switchCase<NewT>(
    value: (value: DataT) => NewT,
    error: (error: ErrorT) => NewT,
  ): NewT {
    const that: unknown = this;
    if (that instanceof ResultValue) {
      return value(that.value);
    }

    return error((that as ResultError<DataT, ErrorT>).error);
  }

  /**
   * A `.then`-like method that guarantees to return a `Result` object.
   *
   * Any exception inside the callback will be caught and converted into an error
   * result.
   */
  follow<NewT>(
    cb: (prev: DataT) => Result<NewT>,
    onError?: (error: unknown) => ErrorT,
  ): Result<NewT> {
    return this.switchCase(
      (value) => cb(value),
      (error) => Result.wrapError(error, onError),
    );
  }

  /**
   * A `.then`-like method that guarantees to return a `Result` object.
   * It is the same as `follow`, but supports asynchronous callbacks.
   */
  followAsync<NewT, ErrorT>(
    cb: (prev: DataT) => Promise<Result<NewT, ErrorT>>,
    onError?: (error: unknown) => ErrorT,
  ): Promise<Result<NewT, ErrorT>> {
    return this.switchCase<Promise<Result<NewT, ErrorT>>>(
      async (value) => {
        try {
          return await cb(value);
        } catch (error) {
          return Result.wrapError(error, onError);
        }
      },
      async (error) => Result.wrapError(error, onError),
    );
  }
}

export class ResultValue<DataT, ErrorT> extends Result<DataT, ErrorT> {
  constructor(readonly value: DataT) {
    super();
  }
}

export class ResultError<DataT, ErrorT> extends Result<DataT, ErrorT> {
  constructor(readonly error: ErrorT) {
    super();
  }
}
