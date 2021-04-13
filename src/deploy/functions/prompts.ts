import * as clc from "cli-color";

import { getFunctionLabel, getFunctionId, getRegion } from "../../functionsDeployHelper";
import { CloudFunctionTrigger } from "./deploymentPlanner";
import { FirebaseError } from "../../error";
import { promptOnce } from "../../prompt";
import { CloudFunction } from "../../gcp/cloudfunctions";
import * as utils from "../../utils";
import { logger } from "../../logger";
import * as args from "./args";
import * as gcf from "../../gcp/cloudfunctions";

/**
 * Checks if a deployment will create any functions with a failure policy.
 * If there are any, prompts the user to acknowledge the retry behavior.
 * @param options
 * @param functions A list of all functions in the deployment
 */
export async function promptForFailurePolicies(
  options: args.Options,
  functions: CloudFunctionTrigger[],
  existingFunctions: CloudFunction[]
): Promise<void> {
  // Collect all the functions that have a retry policy
  const failurePolicyFunctions = functions.filter((fn: CloudFunctionTrigger) => {
    return !!fn.failurePolicy;
  });

  if (failurePolicyFunctions.length === 0) {
    return;
  }

  const existingFailurePolicyFunctions = existingFunctions.filter((fn: CloudFunction) => {
    return !!fn?.eventTrigger?.failurePolicy;
  });
  const newFailurePolicyFunctions = failurePolicyFunctions.filter((fn: CloudFunctionTrigger) => {
    for (const existing of existingFailurePolicyFunctions) {
      if (existing.name === fn.name) {
        return false;
      }
    }
    return true;
  });

  if (newFailurePolicyFunctions.length == 0) {
    return;
  }

  const newFailurePolicyFunctionLabels = newFailurePolicyFunctions.map(
    (fn: CloudFunctionTrigger) => {
      return getFunctionLabel(fn.name);
    }
  );

  const warnMessage =
    "The following functions will newly be retried in case of failure: " +
    clc.bold(newFailurePolicyFunctionLabels.join(", ")) +
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
  functionsToDelete: string[],
  force: boolean,
  nonInteractive: boolean
): Promise<boolean> {
  let shouldDeleteFns = true;
  if (functionsToDelete.length === 0 || force) {
    return true;
  }
  const deleteList = functionsToDelete
    .map((funcName) => {
      return "\t" + getFunctionLabel(funcName);
    })
    .join("\n");

  if (nonInteractive) {
    const deleteCommands = functionsToDelete
      .map((func) => {
        return (
          "\tfirebase functions:delete " + getFunctionId(func) + " --region " + getRegion(func)
        );
      })
      .join("\n");

    throw new FirebaseError(
      "The following functions are found in your project but do not exist in your local source code:\n" +
        deleteList +
        "\n\nAborting because deletion cannot proceed in non-interactive mode. To fix, manually delete the functions by running:\n" +
        clc.bold(deleteCommands)
    );
  } else {
    logger.info(
      "\nThe following functions are found in your project but do not exist in your local source code:\n" +
        deleteList +
        "\n\nIf you are renaming a function or changing its region, it is recommended that you create the new " +
        "function first before deleting the old one to prevent event loss. For more info, visit " +
        clc.underline("https://firebase.google.com/docs/functions/manage-functions#modify" + "\n")
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
