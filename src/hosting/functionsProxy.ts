import { includes } from "lodash";
import { RequestHandler } from "express";

import { proxyRequestHandler } from "./proxy";
import { needProjectId } from "../projectUtils";
import { EmulatorRegistry } from "../emulator/registry";
import { Emulators } from "../emulator/types";
import { FunctionsEmulator } from "../emulator/functionsEmulator";
import { HostingRewrites, LegacyFunctionsRewrite } from "../firebaseConfig";
import { FirebaseError } from "../error";

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
// N.B. This function has been modernized from previous versions. During refactor
// it wasn't clear why this function returns a Promise at all. The original
// version had a bug that it could truly throw instead of returning a rejected
// promise. We're using the async keyword with an obligatory await to prevent
// any future code from having this bug.
export const functionsProxy =
  (options: FunctionsProxyOptions) =>
  async (rewrite: HostingRewrites): Promise<RequestHandler> => {
    const projectId = needProjectId(options);
    if (!("function" in rewrite)) {
      throw new FirebaseError(`A non-function rewrite cannot be used in functionsProxy`, {
        exit: 2,
      });
    }

    // silence linter for no await on an async function.
    await Promise.resolve();

    let id: string;
    let region: string;
    if (typeof rewrite.function === "string") {
      id = rewrite.function;
      region = (rewrite as LegacyFunctionsRewrite).region || "us-central1";
    } else {
      id = rewrite.function.functionId;
      region = rewrite.function.region || "us-central1";
    }
    let url = `https://${region}-${projectId}.cloudfunctions.net/${id}`;
    let destLabel = "live";

    const functionsEmu = EmulatorRegistry.get(Emulators.FUNCTIONS);
    if (includes(options.targets, "functions")) {
      destLabel = "local";

      // If the functions emulator is running we know the port, otherwise
      // things still point to production.
      if (functionsEmu) {
        url = FunctionsEmulator.getHttpFunctionUrl(
          functionsEmu.getInfo().host,
          functionsEmu.getInfo().port,
          projectId,
          id,
          region
        );
      }
    }

    return proxyRequestHandler(url, `${destLabel} Function ${region}/${id}`);
  };
