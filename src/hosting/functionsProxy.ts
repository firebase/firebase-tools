import lodash from "lodash";
const { includes } = lodash;
import { RequestHandler } from "express";

import { proxyRequestHandler } from "./proxy.js";
import { needProjectId } from "../projectUtils.js";
import { EmulatorRegistry } from "../emulator/registry.js";
import { Emulators } from "../emulator/types.js";
import { FunctionsEmulator } from "../emulator/functionsEmulator.js";
import { HostingRewrites } from "../firebaseConfig.js";
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
  options: FunctionsProxyOptions
): (r: HostingRewrites) => Promise<RequestHandler> {
  return (rewrite: HostingRewrites) => {
    return new Promise((resolve) => {
      const projectId = needProjectId(options);
      if (!("function" in rewrite)) {
        throw new FirebaseError(`A non-function rewrite cannot be used in functionsProxy`, {
          exit: 2,
        });
      }
      if (!rewrite.region) {
        rewrite.region = "us-central1";
      }
      let url = `https://${rewrite.region}-${projectId}.cloudfunctions.net/${rewrite.function}`;
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
            rewrite.region
          );
        }
      }

      resolve(
        proxyRequestHandler(url, `${destLabel} Function ${rewrite.region}/${rewrite.function}`)
      );
    });
  };
}
