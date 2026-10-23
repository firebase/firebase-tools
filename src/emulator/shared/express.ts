import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Adapts an async route handler for Express 4, which ignores the promise a handler returns.
 * A rejection is passed to `next(err)` (Express's error handling) instead of becoming an
 * unhandled promise rejection, which by default terminates the Node.js process.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}
