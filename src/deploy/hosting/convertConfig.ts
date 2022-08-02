import { FirebaseError } from "../../error";
import { HostingConfig, HostingRewrites, HostingHeaders } from "../../firebaseConfig";
import {
  existingBackend,
  allEndpoints,
  isHttpsTriggered,
  isCallableTriggered,
} from "../functions/backend";
import { Payload } from "./args";
import * as backend from "../functions/backend";
import { Context } from "../functions/args";
import { logLabeledBullet, logLabeledWarning } from "../../utils";

function has(obj: { [k: string]: unknown }, k: string): boolean {
  return obj[k] !== undefined;
}

/**
 * extractPattern contains the logic for extracting exactly one glob/regexp
 * from a Hosting rewrite/redirect/header specification
 */
function extractPattern(type: string, spec: HostingRewrites | HostingHeaders): any {
  let glob = "";
  let regex = "";
  if ("source" in spec) {
    glob = spec.source;
  }
  if ("glob" in spec) {
    glob = spec.glob;
  }
  if ("regex" in spec) {
    regex = spec.regex;
  }

  if (glob && regex) {
    throw new FirebaseError(`Cannot specify a ${type} pattern with both a glob and regex.`);
  } else if (glob) {
    return { glob: glob };
  } else if (regex) {
    return { regex: regex };
  }
  throw new FirebaseError(
    `Cannot specify a ${type} with no pattern (either a glob or regex required).`
  );
}

interface FunctionsEndpointInfo {
  serviceId: string;
  platform?: string;
  region?: string;
}

/**
 * convertConfig takes a hosting config object from firebase.json and transforms it into
 * the valid format for sending to the Firebase Hosting REST API
 */
export async function convertConfig(
  context: Context,
  payload: Payload,
  config: HostingConfig | undefined,
  finalize: boolean
): Promise<Record<string, any>> {
  if (Array.isArray(config)) {
    throw new FirebaseError(`convertConfig should be given a single configuration, not an array.`, {
      exit: 2,
    });
  }
  const out: Record<string, any> = {};

  if (!config) {
    return out;
  }

  const endpointFromBackend = (
    targetBackend: backend.Backend,
    functionsEndpointInfo: FunctionsEndpointInfo
  ): backend.Endpoint | undefined => {
    const backendsForId = backend.allEndpoints(targetBackend).filter((endpoint) => {
      return endpoint.id === functionsEndpointInfo.serviceId;
    });

    const matchingBackends = backendsForId.filter((endpoint) => {
      return (
        (!functionsEndpointInfo.region || endpoint.region === functionsEndpointInfo.region) &&
        (!functionsEndpointInfo.platform || endpoint.platform === functionsEndpointInfo.platform)
      );
    });

    if (matchingBackends.length > 1) {
      // For now, if `us-central1` is specified, allow that to keep working.
      for (const endpoint of matchingBackends) {
        if (endpoint.region === "us-central1") {
          logLabeledBullet(
            `hosting[${config.site}]`,
            `Function \`${functionsEndpointInfo.serviceId}\` found in multiple regions, defaulting to \`us-central1\`. ` +
              `To rewrite to a different region, specify a \`region\` for the rewrite in \`firebase.json\`.`
          );
          return endpoint;
        }
      }
      throw new FirebaseError(
        `More than one backend found for function name: ${functionsEndpointInfo.serviceId}. If the function is deployed in multiple regions, you must specify a region.`
      );
    }

    if (matchingBackends.length === 1) {
      const endpoint = matchingBackends[0];
      if (endpoint && (isHttpsTriggered(endpoint) || isCallableTriggered(endpoint))) {
        return endpoint;
      }
    }
    return;
  };

  const endpointBeingDeployed = (
    functionsEndpointInfo: FunctionsEndpointInfo
  ): backend.Endpoint | undefined => {
    for (const { wantBackend } of Object.values(payload.functions || {})) {
      if (!wantBackend) {
        continue;
      }
      const endpoint = endpointFromBackend(wantBackend, functionsEndpointInfo);
      if (endpoint) {
        return endpoint;
      }
    }
    return;
  };

  const matchingEndpoint = async (
    functionsEndpointInfo: FunctionsEndpointInfo
  ): Promise<backend.Endpoint | undefined> => {
    const pendingEndpoint = endpointBeingDeployed(functionsEndpointInfo);
    if (pendingEndpoint) return pendingEndpoint;
    const backend = await existingBackend(context);
    return allEndpoints(backend).find(
      (it) =>
        isHttpsTriggered(it) &&
        it.id === functionsEndpointInfo.serviceId &&
        (!functionsEndpointInfo.platform || it.platform === functionsEndpointInfo.platform) &&
        (!functionsEndpointInfo.region || it.region === functionsEndpointInfo.region)
    );
  };

  const findEndpointWithValidRegion = async (
    rewrite: HostingRewrites,
    context: Context
  ): Promise<backend.Endpoint | undefined> => {
    if ("function" in rewrite) {
      const foundEndpointToBeDeployed = endpointBeingDeployed({
        serviceId: rewrite.function,
        region: rewrite.region,
      });
      if (foundEndpointToBeDeployed) {
        return foundEndpointToBeDeployed;
      }

      const existingBackend = await backend.existingBackend(context);

      const endpointAlreadyDeployed = endpointFromBackend(existingBackend, {
        serviceId: rewrite.function,
        region: rewrite.region,
      });
      if (endpointAlreadyDeployed) {
        return endpointAlreadyDeployed;
      }
    }
    return;
  };

  // rewrites
  if (Array.isArray(config.rewrites)) {
    out.rewrites = [];
    for (const rewrite of config.rewrites) {
      const vRewrite = extractPattern("rewrite", rewrite);
      if ("destination" in rewrite) {
        vRewrite.path = rewrite.destination;
      } else if ("function" in rewrite) {
        // Skip these rewrites during hosting prepare
        if (
          !finalize &&
          endpointBeingDeployed({
            serviceId: rewrite.function,
            platform: "gcfv2",
            region: rewrite.region,
          })
        ) {
          continue;
        }
        // Convert function references to GCFv2 to their equivalent run config
        // we can't use the already fetched endpoints, since those are scoped to the codebase
        const endpoint = await matchingEndpoint({
          serviceId: rewrite.function,
          platform: "gcfv2",
          region: rewrite.region,
        });
        if (endpoint) {
          vRewrite.run = { serviceId: endpoint.id, region: endpoint.region };
        } else {
          vRewrite.function = rewrite.function;
          const foundEndpoint = await findEndpointWithValidRegion(rewrite, context);
          if (foundEndpoint) {
            vRewrite.functionRegion = foundEndpoint.region;
          } else {
            if (rewrite.region && rewrite.region !== "us-central1") {
              throw new FirebaseError(
                `Unable to find a valid endpoint for function \`${vRewrite.function}\``
              );
            }
            logLabeledWarning(
              `hosting[${config.site}]`,
              `Unable to find a valid endpoint for function \`${vRewrite.function}\`, but still including it in the config`
            );
          }
        }
      } else if ("dynamicLinks" in rewrite) {
        vRewrite.dynamicLinks = rewrite.dynamicLinks;
      } else if ("run" in rewrite) {
        // Skip these rewrites during hosting prepare
        if (
          !finalize &&
          endpointBeingDeployed({
            serviceId: rewrite.run.serviceId,
            platform: "gcfv2",
            region: rewrite.run.region,
          })
        ) {
          continue;
        }
        vRewrite.run = Object.assign({ region: "us-central1" }, rewrite.run);
      }
      out.rewrites.push(vRewrite);
    }
  }

  // redirects
  if (Array.isArray(config.redirects)) {
    out.redirects = config.redirects.map((redirect) => {
      const vRedirect = extractPattern("redirect", redirect);
      vRedirect.location = redirect.destination;
      if (redirect.type) {
        vRedirect.statusCode = redirect.type;
      }
      return vRedirect;
    });
  }

  // headers
  if (Array.isArray(config.headers)) {
    out.headers = config.headers.map((header) => {
      const vHeader = extractPattern("header", header);
      vHeader.headers = {};
      if (Array.isArray(header.headers) && header.headers.length) {
        header.headers.forEach((h) => {
          vHeader.headers[h.key] = h.value;
        });
      }
      return vHeader;
    });
  }

  // cleanUrls
  if (has(config, "cleanUrls")) {
    out.cleanUrls = config.cleanUrls;
  }

  // trailingSlash
  if (config.trailingSlash === true) {
    out.trailingSlashBehavior = "ADD";
  } else if (config.trailingSlash === false) {
    out.trailingSlashBehavior = "REMOVE";
  }

  // App association files
  if (has(config, "appAssociation")) {
    out.appAssociation = config.appAssociation;
  }

  // i18n config
  if (has(config, "i18n")) {
    out.i18n = config.i18n;
  }

  return out;
}
