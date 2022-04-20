import { FirebaseError } from "../../error";
import { HostingConfig, HostingRewrites, HostingHeaders } from "../../firebaseConfig";
import { existingBackend, allEndpoints, isHttpsTriggered } from "../functions/backend";
import { Payload } from "./args";

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

/**
 * convertConfig takes a hosting config object from firebase.json and transforms it into
 * the valid format for sending to the Firebase Hosting REST API
 */
export async function convertConfig(
  context: any,
  payload: Payload,
  config: HostingConfig | undefined,
  finalize: boolean
): Promise<{ [k: string]: any }> {
  if (Array.isArray(config)) {
    throw new FirebaseError(`convertConfig should be given a single configuration, not an array.`, {
      exit: 2,
    });
  }
  const out: { [k: string]: any } = {};

  if (!config) {
    return out;
  }

  const endpointBeingDeployed = (serviceId: string, region: string = "us-central1") => {
    for (const { wantBackend } of Object.values(payload.functions || {})) {
      const endpoint = wantBackend?.endpoints[region]?.[serviceId];
      if (endpoint && isHttpsTriggered(endpoint) && endpoint.platform === "gcfv2") return endpoint;
    }
    return undefined;
  };

  const matchingEndpoint = async (serviceId: string, region: string = "us-central1") => {
    const pendingEndpoint = endpointBeingDeployed(serviceId, region);
    if (pendingEndpoint) return pendingEndpoint;
    const backend = await existingBackend(context);
    return allEndpoints(backend).find(
      (it) =>
        isHttpsTriggered(it) &&
        it.platform === "gcfv2" &&
        it.id === serviceId &&
        it.region === region
    );
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
        if (!finalize && endpointBeingDeployed(rewrite.function, rewrite.region)) continue;
        // Convert function references to GCFv2 to their equivalent run config
        // we can't use the already fetched endpoints, since those are scoped to the codebase
        const endpoint = await matchingEndpoint(rewrite.function, rewrite.region);
        if (endpoint) {
          vRewrite.run = { serviceId: endpoint.id, region: endpoint.region };
        } else {
          vRewrite.function = rewrite.function;
          if (rewrite.region) {
            vRewrite.functionRegion = rewrite.region;
          } else {
            vRewrite.functionRegion = "us-central1";
          }
        }
      } else if ("dynamicLinks" in rewrite) {
        vRewrite.dynamicLinks = rewrite.dynamicLinks;
      } else if ("run" in rewrite) {
        // Skip these rewrites during hosting prepare
        if (!finalize && endpointBeingDeployed(rewrite.run.serviceId, rewrite.run.region)) continue;
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
