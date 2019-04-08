import { includes } from "lodash";
import { RequestHandler } from "express";

import { proxyRequestHandler } from "./proxy";
import * as getProjectId from "../getProjectId";

export interface FunctionsProxyOptions {
  port: number;
  project?: string;
  targets: string[];
}

export interface FunctionProxyRewrite {
  function: string;
}

/**
 * Returns a function which, given a FunctionProxyRewrite, returns a Promise
 * that resolves with a middleware-like function that proxies the request to a
 * hosted or live function.
 */
export default function(
  options: FunctionsProxyOptions
): (r: FunctionProxyRewrite) => Promise<RequestHandler> {
  return async (rewrite: FunctionProxyRewrite) => {
    let url = `https://us-central1-${getProjectId(options, false)}.cloudfunctions.net/${
      rewrite.function
    }`;
    let destLabel = "live";
    if (includes(options.targets, "functions")) {
      destLabel = "local";
      url = `http://localhost:${options.port + 1}/${getProjectId(options, false)}/us-central1/${
        rewrite.function
      }`;
    }

    return await proxyRequestHandler(url, `${destLabel} Function ${rewrite.function}`);
  };
}
