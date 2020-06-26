import { logLabeledWarning } from "../../utils";
import { bold } from "cli-color";
import { promptOnce } from "../../prompt";
import { FirebaseError } from "../../error";
import * as track from "../../track";
import * as logger from "../../logger";

const LEGACY_RUNTIMES = ["nodejs6", "nodejs8", "nodejs10"];

const FAQ_URL = "https://firebase.google.com/docs/functions/manage-functions#node12-upgrade";

function pluralizedFunctions(arr: any[]) {
  return `function${arr.length === 1 ? "" : "s"}`;
}

function printForceWarning(runtimeChoice: string, fnNames: string[]) {
  logger.warn();
  logLabeledWarning(
    "functions",
    `Updating HTTP ${pluralizedFunctions(fnNames)} ${bold(fnNames.join(","))} to the ${bold(
      runtimeChoice
    )} runtime. HTTP URL behavior has changed as of Node.js 12.\n\nAdditional details:\n${FAQ_URL}`
  );
  logger.warn();
}

function printUpgradePrompt(runtimeChoice: string, fnNames: string[]): void {
  const fnName = fnNames[0];
  logger.warn();
  logLabeledWarning(
    "functions",
    `Updating function${fnNames.length === 1 ? "" : "s"} ${bold(fnNames.join(","))} to the ${bold(
      runtimeChoice
    )} runtime. As of Node.js 12, the function name is not stripped from the incoming request path. Example difference:

    // before when requesting /${fnName}/example/path
    request.path === "/example/path"
    // after when requesting /${fnName}/example/path
    request.path === "/${fnName}/example/path"

Ensure you've updated your code accordingly before deploying. Additional details:\n${FAQ_URL}`
  );
  logger.warn();
}

function throwNonInteractiveError(runtimeChoice: string, fnNames: string[]): void {
  throw new FirebaseError(
    `Cannot deploy HTTP ${pluralizedFunctions(fnNames)} ${fnNames.join(
      ","
    )} to runtime ${runtimeChoice} without confirmation of changes in HTTP URL handling. Run deploy interactively or pass --force to skip this check.\n\nAdditional details:\n${FAQ_URL}`
  );
}

export async function checkRuntimeMigrations(
  context: {
    runtimeChoice: string;
    existingFunctions: { functionName: string; runtime: string; httpsTrigger?: {} }[];
  },
  options: { force?: boolean; nonInteractive?: boolean },
  payload: { functions: { triggers: { name: string; httpsTrigger?: {} }[] } }
): Promise<void> {
  const { existingFunctions, runtimeChoice } = context;
  const deployingFunctions = payload.functions.triggers;

  if (LEGACY_RUNTIMES.includes(runtimeChoice)) {
    logger.debug(`[functions] skipping HTTP URL warning for runtime ${runtimeChoice}`);
    return;
  }

  const existingNonupgradedFunctionNames: string[] = existingFunctions
    .filter((f) => LEGACY_RUNTIMES.includes(f.runtime) && f.httpsTrigger)
    .map((f) => f.functionName);

  logger.debug("[functions] legacy runtime HTTP functions:", existingNonupgradedFunctionNames);

  const upgradingFunctionNames = deployingFunctions
    .filter((f) => f.httpsTrigger && existingNonupgradedFunctionNames.includes(f.name))
    .map((f) => f.name);
  logger.debug("[functions] upgrading HTTP functions:", upgradingFunctionNames);

  if (upgradingFunctionNames.length === 0) {
    return;
  } else if (options.force) {
    track("functions_runtime_notices", "nodejs12_upgrade_force");
    // if it's a forced deploy, print a warning but proceed
    printForceWarning(runtimeChoice, upgradingFunctionNames);
    return;
  } else if (options.nonInteractive) {
    track("functions_runtime_notices", "nodejs12_upgrade_noninteractive_error");
    throwNonInteractiveError(runtimeChoice, upgradingFunctionNames);
    return;
  }

  printUpgradePrompt(runtimeChoice, upgradingFunctionNames);

  const proceed = await promptOnce({
    name: "proceed",
    type: "confirm",
    message: "Proceed with deploy?",
    default: true,
  });

  if (proceed) {
    track("functions_runtime_notices", "nodejs12_upgrade_aborted");
  } else {
    track("functions_runtime_notices", "nodejs12_upgrade_confirmed");
    throw new FirebaseError("Aborted by user.");
  }
}
