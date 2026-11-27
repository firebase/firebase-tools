import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { getErrMsg, getErrStack } from "../../error";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators } from "../types";

/**
 * Adapts an async route handler for Express 4, which ignores the promise a handler returns.
 * A rejection is passed to `next(err)` (Express's error handling) instead of becoming an
 * unhandled promise rejection, which by default terminates the Node.js process.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch((err: unknown) => {
      next(err ?? new Error("Async route handler rejected without a reason"));
    });
  };
}

/**
 * Last-resort error handler for an emulator's Express app. Register it after all routes.
 * Replies with JSON instead of Express's default HTML error page, which includes the stack
 * trace unless NODE_ENV is "production", and logs server errors through the emulator logger.
 */
export function jsonErrorHandler(emulator: Emulators): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const e = err as { status?: unknown; statusCode?: unknown } | undefined;
    const status = e?.status ?? e?.statusCode;
    const code = typeof status === "number" && status >= 400 && status < 600 ? status : 500;
    if (code >= 500) {
      EmulatorLogger.forEmulator(emulator).log(
        "WARN",
        `${req.method} ${req.path} failed: ${getErrStack(err)}`,
      );
    }
    res
      .status(code)
      .json({ error: { code, message: code < 500 ? getErrMsg(err) : "Internal error" } });
  };
}
