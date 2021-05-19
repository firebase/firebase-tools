import { includes } from "lodash";
import { RequestHandler } from "express";

import { proxyRequestHandler } from "./proxy";
import { needProjectId } from "../projectUtils";
import { EmulatorRegistry } from "../emulator/registry";
import { Emulators } from "../emulator/types";
import { FunctionsEmulator } from "../emulator/functionsEmulator";

export interface FunctionsProxyOptions {
  port: number;
  project?: string;
  targets: string[];
}

export interface FunctionProxyRewrite {
  function: string;
  function_region: string;
}

/**
 * Returns a function which, given a FunctionProxyRewrite, returns a Promise
 * that resolves with a middleware-like function that proxies the request to a
 * hosted or live function.
 */
export function functionsProxy(
  options: FunctionsProxyOptions
): (r: FunctionProxyRewrite) => Promise<RequestHandler> {
  return (rewrite: FunctionProxyRewrite) => {
    return new Promise((resolve) => {
      const projectId = needProjectId(options);
      if (!rewrite.function_region) {
        rewrite.function_region = "us-central1";
      }
      let url = `https://${rewrite.function_region}-${projectId}.cloudfunctions.net/${rewrite.function}`;
      let destLabel = "live";

      if (includes(options.targets, "functions")) {
        destLabel = "local";

        // If the functions emulator is running we know the port, otherwise
        // things still point to production.
        const functionsEmu = EmulatorRegistry.get(Emulators.FUNCTIONS);
        if (functionsEmu) {
          url = FunctionsEmulator.getHttpFunctionUrl(
            functionsEmu.getInfo().host,
            functionsEmu.getInfo().port,
            projectId,
            rewrite.function,
            rewrite.function_region
          );
        }
      }

      resolve(
        proxyRequestHandler(
          url,
          `${destLabel} Function ${rewrite.function_region}/${rewrite.function}`
        )
      );
    });
  };
}
