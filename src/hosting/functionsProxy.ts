import { includes } from "lodash";
import { RequestHandler } from "express";

import { proxyRequestHandler } from "./proxy";
import * as getProjectId from "../getProjectId";
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
}

/**
 * Returns a function which, given a FunctionProxyRewrite, returns a Promise
 * that resolves with a middleware-like function that proxies the request to a
 * hosted or live function.
 */
export default function(
  options: FunctionsProxyOptions
): (r: FunctionProxyRewrite) => Promise<RequestHandler> {
  return (rewrite: FunctionProxyRewrite) => {
    return new Promise((resolve) => {
      // TODO(samstern): This proxy assumes all functions are in the default region, but this is
      //                 not a safe assumption.
      const projectId = getProjectId(options, false);
      let url = `https://us-central1-${projectId}.cloudfunctions.net/${rewrite.function}`;
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
            "us-central1"
          );
        }
      }

      resolve(proxyRequestHandler(url, `${destLabel} Function ${rewrite.function}`));
    });
  };
}
