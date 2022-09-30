import { FirebaseError } from "../../error";
import { HostingSource } from "../../firebaseConfig";
import { HostingDeploy } from "./context";
import * as api from "../../hosting/api";
import * as backend from "../functions/backend";
import { Context } from "../functions/args";
import { logLabeledBullet, logLabeledWarning } from "../../utils";
import * as proto from "../../gcp/proto";
import { bold } from "colorette";
import * as runTags from "../../hosting/runTags";
import { assertExhaustive } from "../../functional";

/**
 * extractPattern contains the logic for extracting exactly one glob/regexp
 * from a Hosting rewrite/redirect/header specification
 */
function extractPattern(type: string, source: HostingSource): api.HasPattern {
  let glob: string | undefined;
  let regex: string | undefined;
  if ("source" in source) {
    glob = source.source;
  }
  if ("glob" in source) {
    glob = source.glob;
  }
  if ("regex" in source) {
    regex = source.regex;
  }

  if (glob && regex) {
    throw new FirebaseError(`Cannot specify a ${type} pattern with both a glob and regex.`);
  } else if (glob) {
    return { glob };
  } else if (regex) {
    return { regex };
  }
  throw new FirebaseError(
    `Cannot specify a ${type} with no pattern (either a glob or regex required).`
  );
}

/**
 * Finds an endpoint suitable for deploy at a site given an id and optional region
 */
export function findEndpointForRewrite(
  site: string,
  targetBackend: backend.Backend,
  id: string,
  region: string | undefined
): backend.Endpoint | undefined {
  const endpoints = backend.allEndpoints(targetBackend).filter((e) => e.id === id);

  if (endpoints.length === 0) {
    return;
  }
  if (endpoints.length === 1) {
    if (region && region !== endpoints[0].region) {
      return;
    }
    return endpoints[0];
  }
  if (!region) {
    const us = endpoints.find((e) => e.region === "us-central1");
    if (!us) {
      throw new FirebaseError(
        `More than one backend found for function name: ${id}. If the function is deployed in multiple regions, you must specify a region.`
      );
    }
    logLabeledBullet(
      `hosting[${site}]`,
      `Function \`${id}\` found in multiple regions, defaulting to \`us-central1\`. ` +
        `To rewrite to a different region, specify a \`region\` for the rewrite in \`firebase.json\`.`
    );
    return us;
  }
  return endpoints.find((e) => e.region === region);
}

/**
 * convertConfig takes a hosting config object from firebase.json and transforms it into
 * the valid format for sending to the Firebase Hosting REST API
 */
export async function convertConfig(
  context: Context,
  deploy: HostingDeploy
): Promise<api.ServingConfig> {
  const config: api.ServingConfig = {};

  // We need to be able to do a rewrite to an existing function that is may not
  // even be part of Firebase's control or a function that we're currently
  // deploying.
  const haveBackend = await backend.existingBackend(context);

  config.rewrites = deploy.config.rewrites?.map((rewrite) => {
    const target = extractPattern("rewrite", rewrite);
    if ("destination" in rewrite) {
      return {
        ...target,
        path: rewrite.destination,
      };
    }

    if ("function" in rewrite) {
      if (typeof rewrite.function === "string") {
        throw new FirebaseError(
          "Expected firebase config to be normalized, but got legacy functions format"
        );
      }
      const id = rewrite.function.functionId;
      const region = rewrite.function.region;
      const endpoint = findEndpointForRewrite(deploy.config.site, haveBackend, id, region);
      if (!endpoint) {
        // This could possibly succeed if there has been a function written
        // outside firebase tooling. But it will break in v2. We might need to
        // revisit this.
        logLabeledWarning(
          `hosting[${deploy.config.site}]`,
          `Unable to find a valid endpoint for function \`${id}\`, but still including it in the config`
        );
        const apiRewrite: api.Rewrite = { ...target, function: id };
        if (region) {
          apiRewrite.functionRegion = region;
        }
        return apiRewrite;
      }
      if (endpoint.platform === "gcfv1") {
        if (!backend.isHttpsTriggered(endpoint) && !backend.isCallableTriggered(endpoint)) {
          throw new FirebaseError(
            `Function ${endpoint.id} is a gen 1 function and therefore must be an https function type`
          );
        }
        if (rewrite.function.pinTag) {
          throw new FirebaseError(
            `Function ${endpoint.id} is a gen 1 function and therefore does not support the ${bold(
              "pinTag"
            )} option`
          );
        }
        return {
          ...target,
          function: endpoint.id,
          functionRegion: endpoint.region,
        } as api.Rewrite;
      }

      // V2 functions are actually deployed as run rewrites. This lets us target
      // the service without a cloudfunctions.net URL and allows us to set a
      // target tag.
      const apiRewrite: api.Rewrite = {
        ...target,
        run: {
          serviceId: endpoint.id,
          region: endpoint.region,
        },
      };
      if (rewrite.function.pinTag) {
        apiRewrite.run.tag = runTags.TODO_TAG_NAME;
      }
      return apiRewrite;
    }

    if ("dynamicLinks" in rewrite) {
      if (!rewrite.dynamicLinks) {
        throw new FirebaseError("Can only set dynamicLinks to true in a rewrite");
      }
      return { ...target, dynamicLinks: true };
    }

    if ("run" in rewrite) {
      // It's easier to do both GCF 2nd gen and Run rewrites in the second pass
      // so that we can do a single pass generating tagged traffic targets.
      return {
        ...target,
        run: {
          region: "us-central1",
          ...rewrite.run,
        },
      };
    }

    // This line makes sure this function breaks if there is ever added a new
    // kind of rewrite and we haven't yet handled it.
    assertExhaustive(rewrite);
  });

  if (config.rewrites) {
    await runTags.setRewriteTags(config.rewrites, context.projectId, deploy.version);
  }

  config.redirects = deploy.config.redirects?.map((redirect) => {
    const apiRedirect: api.Redirect = {
      ...extractPattern("redirect", redirect),
      location: redirect.destination,
    };
    if (redirect.type) {
      apiRedirect.statusCode = redirect.type;
    }
    return apiRedirect;
  });

  config.headers = deploy.config.headers?.map((header) => {
    const headers: api.Header["headers"] = {};
    for (const { key, value } of header.headers || []) {
      headers[key] = value;
    }
    return {
      ...extractPattern("header", header),
      headers,
    };
  });

  proto.copyIfPresent(config, deploy.config, "cleanUrls", "appAssociation", "i18n");
  proto.convertIfPresent(config, deploy.config, "trailingSlashBehavior", "trailingSlash", (b) =>
    b ? "ADD" : "REMOVE"
  );

  proto.pruneUndefiends(config);
  return config;
}
