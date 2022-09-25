import { FirebaseError } from "../../error";
import { HostingSource } from "../../firebaseConfig";
import { HostingDeploy } from "./context";
import * as api from "../../hosting/api";
import { Payload } from "./args";
import * as backend from "../functions/backend";
import { Context } from "../functions/args";
import { logLabeledBullet } from "../../utils";
import * as proto from "../../gcp/proto";
import { bold } from "colorette";
import * as tags from "../../hosting/serverlessTags";
import { assertExhaustive } from "../../functional";
import { logger } from "../../logger";
import { randomUUID } from "crypto";

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
 * Finds a backend.Endpoint suitable for use as a Hosting rewrite target.
 */
export function findEndpointForRewrite(
  site: string,
  targetBackend: backend.Backend,
  id: string,
  region?: string,
  platform?: backend.FunctionsPlatform
): backend.Endpoint | undefined {
  const matches = backend.allEndpoints(targetBackend).filter((e: backend.Endpoint) => {
    if (platform && platform !== e.platform) {
      return false;
    }
    if (region && region !== e.region) {
      return false;
    }
    return id === e.id;
  });

  const assertUsable = (e: backend.Endpoint): void => {
    if (backend.isHttpsTriggered(e) || backend.isCallableTriggered(e)) {
      return;
    }
    throw new FirebaseError(
      `Cannot rewrite to function ${e.id} because it is neither an HTTPS or Callable function`
    );
  };

  if (matches.length === 0) {
    return undefined;
  } else if (matches.length === 1) {
    assertUsable(matches[0]);
    return matches[0];
  }

  // For now, if `us-central1` is specified, allow that to keep working.
  const us = matches.find((e) => e.region === "us-central1");
  if (us) {
    assertUsable(us);
    logLabeledBullet(
      `hosting[${site}]`,
      `Function \`${id}\` found in multiple regions, defaulting to \`us-central1\`. ` +
        `To rewrite to a different region, specify a \`region\` for the rewrite in \`firebase.json\`.`
    );
    return us;
  }
  throw new FirebaseError(
    `More than one backend found for function name: ${id}. If the function is deployed in multiple regions, you must specify a region.`
  );
}

/**
 * convertConfig takes a hosting config object from firebase.json and transforms it into
 * the valid format for sending to the Firebase Hosting REST API
 */
// TODO: finalize seems like a code smell and it's because we create the version
// in prepare and then finalize the version in release. This is a hack we had to
// do to make v2 functions and serverless tagging work. It might be better to
// instead only set the config in the finalize version and remove the finalize
// code path here.
export async function convertConfig(
  context: Context,
  payload: Payload,
  deploy: HostingDeploy,
  finalize: boolean
): Promise<api.ServingConfig> {
  const config: api.ServingConfig = {};

  // We need to be able to do a rewrite to an existing function that is may not
  // even be part of Firebase's control or a function that we're currently
  // deploying.
  const targetBackend: backend.Backend = backend.merge(
    await backend.existingBackend(context),
    ...Object.values(payload.functions || {}).map((payload) => payload.wantBackend)
  );

  config.rewrites = deploy.config.rewrites
    ?.map((rewrite) => {
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
        const endpoint = findEndpointForRewrite(
          deploy.site,
          targetBackend,
          rewrite.function.functionId,
          rewrite.function.region
        );
        if (!endpoint) {
          throw new FirebaseError(`Unable to find function ${rewrite.function.functionId}`);
        }

        if (endpoint.platform === "gcfv1") {
          if (rewrite.function.pinTag) {
            throw new FirebaseError(
              `Function ${
                endpoint.id
              } is a gen 1 function and therefore does not support the ${bold("pinTag")} option`
            );
          }
          const apiRewrite: api.Rewrite = {
            ...target,
            function: rewrite.function.functionId,
          };
          proto.renameIfPresent(apiRewrite, rewrite.function, "functionRegion", "region");
          return apiRewrite;
        }

        // If we still haven't hit the release phase, the run service may not have
        // been created yet and putting this service rewrite in the version will
        // fail it. Better to return null & filter it out for now.
        // Normally you'd think that we should just defer creating the version
        // until we have deployed our Run services and I'd agree with you, but
        // we'd like to tag run revisions with the first version they were used
        // in and that requirees us to have a version id. Guess we're stuck with
        // two passes.
        if (!finalize) {
          return null;
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
          apiRewrite.run.tag = tags.TODO_TAG_NAME;
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
        if (!finalize) {
          return null;
        }
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
    })

    // Drop nullls
    .filter((r) => r) as api.Rewrite[];

  if (finalize && config.rewrites) {
    if (!deploy.version) {
      logger.debug("Assertion failed: expected to have a version by the time we are finalizing");
    }
    // version will be part of the tag which is part of a URI component so we
    // should be sure not to let it be too long.
    const version = deploy.version || randomUUID().substring(0, 10);
    await tags.setRewriteTags(config.rewrites, context.projectId, version);
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

  return config;
}
