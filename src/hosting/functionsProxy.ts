import { RequestHandler } from "express";

import { proxyRequestHandler } from "./proxy.js";
import { needProjectId } from "../projectUtils.js";
import { EmulatorRegistry } from "../emulator/registry.js";
import { Emulators } from "../emulator/types.js";
import { FunctionsEmulator } from "../emulator/functionsEmulator.js";
import { HostingRewrites, LegacyFunctionsRewrite } from "../firebaseConfig.js";
import { FirebaseError } from "../error.js";

export interface FunctionsProxyOptions {
  port: number;
  project?: string;
  targets: string[];
}

/**
 * Returns a function which, given a FunctionProxyRewrite, returns a Promise
 * that resolves with a middleware-like function that proxies the request to a
 * hosted or live function.
 */
export function functionsProxy(
  options: FunctionsProxyOptions,
): (r: HostingRewrites) => Promise<RequestHandler> {
  return (rewrite: HostingRewrites) => {
    return new Promise((resolve) => {
      const projectId = needProjectId(options);
      if (!("function" in rewrite)) {
        throw new FirebaseError(`A non-function rewrite cannot be used in functionsProxy`, {
          exit: 2,
        });
      }
      let functionId: string;
      let region: string;
      if (typeof rewrite.function === "string") {
        functionId = rewrite.function;
        region = (rewrite as LegacyFunctionsRewrite).region || "us-central1";
      } else {
        functionId = rewrite.function.functionId;
        region = rewrite.function.region || "us-central1";
      }
      let url = `https://${region}-${projectId}.cloudfunctions.net/${functionId}`;
      let destLabel = "live";

      if (options.targets?.includes("functions")) {
        destLabel = "local";

        // If the functions emulator is running we know the port, otherwise
        // things still point to production.
        if (EmulatorRegistry.isRunning(Emulators.FUNCTIONS)) {
          url = FunctionsEmulator.getHttpFunctionUrl(projectId, functionId, region);
        }
      }

      resolve(proxyRequestHandler(url, `${destLabel} Function ${region}/${functionId}`));
    });
  };
}
