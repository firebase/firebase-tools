import * as clc from "colorette";

import { getFunctionLabel } from "./functionsDeployHelper";
import { FirebaseError } from "../../error";
import { promptOnce } from "../../prompt";
import { logger } from "../../logger";
import * as backend from "./backend";
import * as pricing from "./pricing";
import * as utils from "../../utils";
import { Options } from "../../options";
import { EndpointUpdate } from "./release/planner";

/**
 * Checks if a deployment will create any functions with a failure policy
 * or add a failure policy to an existing function.
 * If there are any, prompts the user to acknowledge the retry behavior.
 * @param options
 * @param functions A list of all functions in the deployment
 */
export async function promptForFailurePolicies(
  options: Options,
  want: backend.Backend,
  have: backend.Backend,
): Promise<void> {
  // Collect all the functions that have a retry policy
  const retryEndpoints = backend.allEndpoints(want).filter((e) => {
    return backend.isEventTriggered(e) && e.eventTrigger.retry;
  });

  if (retryEndpoints.length === 0) {
    return;
  }

  const newRetryEndpoints = retryEndpoints.filter((endpoint) => {
    const existing = have.endpoints[endpoint.region]?.[endpoint.id];
    return !(existing && backend.isEventTriggered(existing) && existing.eventTrigger.retry);
  });

  if (newRetryEndpoints.length === 0) {
    return;
  }

  const warnMessage =
    "The following functions will newly be retried in case of failure: " +
    clc.bold(newRetryEndpoints.sort(backend.compareFunctions).map(getFunctionLabel).join(", ")) +
    ". " +
    "Retried executions are billed as any other execution, and functions are retried repeatedly until they either successfully execute or the maximum retry period has elapsed, which can be up to 7 days. " +
    "For safety, you might want to ensure that your functions are idempotent; see https://firebase.google.com/docs/functions/retries to learn more.";

  utils.logLabeledWarning("functions", warnMessage);

  if (options.force) {
    return;
  }
  if (options.nonInteractive) {
    throw new FirebaseError("Pass the --force option to deploy functions with a failure policy", {
      exit: 1,
    });
  }
  const proceed = await promptOnce({
    type: "confirm",
    name: "confirm",
    default: false,
    message: "Would you like to proceed with deployment?",
  });
  if (!proceed) {
    throw new FirebaseError("Deployment canceled.", { exit: 1 });
  }
}

/**
 * Checks if a deployment will delete any functions.
 * If there are any, prompts the user if they should be deleted or not.
 * @param options
 * @param functions A list of functions to be deleted.
 */
export async function promptForFunctionDeletion(
  functionsToDelete: (backend.TargetIds & { platform: backend.FunctionsPlatform })[],
  options: Options,
): Promise<boolean> {
  let shouldDeleteFns = true;
  if (functionsToDelete.length === 0 || options.force) {
    return true;
  }
  const deleteList = functionsToDelete
    .sort(backend.compareFunctions)
    .map((fn) => "\t" + getFunctionLabel(fn))
    .join("\n");

  if (options.nonInteractive) {
    const deleteCommands = functionsToDelete
      .map((func) => {
        return "\tfirebase functions:delete " + func.id + " --region " + func.region;
      })
      .join("\n");

    throw new FirebaseError(
      "The following functions are found in your project but do not exist in your local source code:\n" +
        deleteList +
        "\n\nAborting because deletion cannot proceed in non-interactive mode. To fix, manually delete the functions by running:\n" +
        clc.bold(deleteCommands),
    );
  } else {
    logger.info(
      "\nThe following functions are found in your project but do not exist in your local source code:\n" +
        deleteList +
        "\n\nIf you are renaming a function or changing its region, it is recommended that you create the new " +
        "function first before deleting the old one to prevent event loss. For more info, visit " +
        clc.underline("https://firebase.google.com/docs/functions/manage-functions#modify" + "\n"),
    );
    shouldDeleteFns = await promptOnce({
      type: "confirm",
      name: "confirm",
      default: false,
      message:
        "Would you like to proceed with deletion? Selecting no will continue the rest of the deployments.",
    });
  }
  return shouldDeleteFns;
}

/**
 * Prompts users to confirm potentially unsafe function updates.
 * Cases include:
 * Migrating from 2nd gen Firestore  triggers to Firestore triggers with auth context
 * @param fnsToUpdate An array of endpoint updates
 * @param options
 * @returns An array of endpoints to proceed with updating
 */
export async function promptForUnsafeMigration(
  fnsToUpdate: EndpointUpdate[],
  options: Options,
): Promise<EndpointUpdate[]> {
  const unsafeUpdates = fnsToUpdate.filter((eu) => eu.unsafe);

  if (unsafeUpdates.length === 0 || options.force) {
    return fnsToUpdate;
  }

  const warnMessage =
    "The following functions are unsafely changing event types: " +
    clc.bold(
      unsafeUpdates
        .map((eu) => eu.endpoint)
        .sort(backend.compareFunctions)
        .map(getFunctionLabel)
        .join(", "),
    ) +
    ". " +
    "While automatic migration is allowed for these functions, updating the underlying event type may result in data loss. " +
    "To avoid this, consider the best practices outlined in the migration guide: [TODO: link]";

  utils.logLabeledWarning("functions", warnMessage);

  const safeUpdates = fnsToUpdate.filter((eu) => !eu.unsafe);

  if (options.nonInteractive) {
    utils.logLabeledWarning(
      "functions",
      "Aborting updates for functions that may be unsafe to update. To update these functions anyway, deploy again in interactive mode or use the --force option.",
    );
    return safeUpdates;
  }

  for (const eu of unsafeUpdates) {
    const shouldUpdate = await promptOnce({
      type: "confirm",
      name: "confirm",
      default: false,
      message: `[${getFunctionLabel(
        eu.endpoint,
      )}] Would you like to proceed with the unsafe migration?`,
    });
    if (shouldUpdate) {
      safeUpdates.push(eu);
    }
  }
  return safeUpdates;
}

/**
 * Checks whether a deploy will increase the min instance idle time bill of
 * any function. Cases include:
 * Setting minInstances on a new or existing function
 * Increasing the minInstances of an existing function
 * Increasing the CPU or memory of a function with min instances
 * If there are any, prompts the user to confirm a minimum bill.
 */
export async function promptForMinInstances(
  options: Options,
  want: backend.Backend,
  have: backend.Backend,
): Promise<void> {
  if (options.force) {
    return;
  }

  const increasesCost = backend.someEndpoint(want, (wantE) => {
    // If we don't know how much this will cost, be pessimal
    if (!pricing.canCalculateMinInstanceCost(wantE)) {
      return true;
    }
    const wantCost = pricing.monthlyMinInstanceCost([wantE]);
    const haveE = have.endpoints[wantE.region]?.[wantE.id];
    let haveCost;
    if (!haveE) {
      haveCost = 0;
    } else if (!pricing.canCalculateMinInstanceCost(wantE)) {
      return true;
    } else {
      haveCost = pricing.monthlyMinInstanceCost([haveE]);
    }
    return wantCost > haveCost;
  });

  if (!increasesCost) {
    return;
  }

  if (options.nonInteractive) {
    throw new FirebaseError(
      "Pass the --force option to deploy functions that increase the minimum bill",
      {
        exit: 1,
      },
    );
  }

  // Considerations for future versions:
  // Group Tier 1 and Tier 2 regions
  // Add Tier 1 or Tier 2 annotations to functionLines
  const functionLines = backend
    .allEndpoints(want)
    .filter((fn) => fn.minInstances)
    .sort(backend.compareFunctions)
    .map((fn) => {
      return (
        `\t${getFunctionLabel(fn)}: ${fn.minInstances} instances, ` +
        backend.memoryOptionDisplayName(fn.availableMemoryMb || backend.DEFAULT_MEMORY) +
        " of memory each"
      );
    })
    .join("\n");

  let costLine;
  if (backend.someEndpoint(want, (fn) => !pricing.canCalculateMinInstanceCost(fn))) {
    costLine =
      "Cannot calculate the minimum monthly bill for this configuration. Consider running " +
      clc.bold("npm install -g firebase-tools");
  } else {
    const cost = pricing.monthlyMinInstanceCost(backend.allEndpoints(want)).toFixed(2);
    costLine = `With these options, your minimum bill will be $${cost} in a 30-day month`;
  }
  const warnMessage =
    "The following functions have reserved minimum instances. This will " +
    "reduce the frequency of cold starts but increases the minimum cost. " +
    "You will be charged for the memory allocation and a fraction of the " +
    "CPU allocation of instances while they are idle.\n\n" +
    functionLines +
    "\n\n" +
    costLine;

  utils.logLabeledWarning("functions", warnMessage);

  const proceed = await promptOnce({
    type: "confirm",
    name: "confirm",
    default: false,
    message: "Would you like to proceed with deployment?",
  });
  if (!proceed) {
    throw new FirebaseError("Deployment canceled.", { exit: 1 });
  }
}
