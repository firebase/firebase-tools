import { StorageRulesetInstance } from "./runtime";
import { RulesResourceMetadata } from "../metadata";
import { RulesetOperationMethod } from "./types";
import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";

/** Variable overrides to be passed to the rules evaluator. */
export type RulesVariableOverrides = {
  before?: RulesResourceMetadata;
  after?: RulesResourceMetadata;
};

/** Authorizes storage requests via Firebase Rules rulesets. */
export interface FirebaseRulesValidator {
  validate(
    path: string,
    bucketId: string,
    method: RulesetOperationMethod,
    variableOverrides: RulesVariableOverrides,
    projectId: string,
    authorization?: string,
    delimiter?: string,
  ): Promise<boolean>;
}

/** Authorizes storage requests via admin credentials. */
export interface AdminCredentialValidator {
  validate(authorization?: string): boolean;
}

/** Provider for Storage security rules. */
export type RulesetProvider = (resource: string) => StorageRulesetInstance | undefined;

/**
 * Returns a validator that pulls a Ruleset from a {@link RulesetProvider} on each run.
 */
export function getFirebaseRulesValidator(
  rulesetProvider: RulesetProvider,
): FirebaseRulesValidator {
  return {
    validate: async (
      path: string,
      bucketId: string,
      method: RulesetOperationMethod,
      variableOverrides: RulesVariableOverrides,
      projectId: string,
      authorization?: string,
      delimiter?: string,
    ) => {
      return await isPermitted({
        ruleset: rulesetProvider(bucketId),
        file: variableOverrides,
        path,
        method,
        projectId,
        authorization,
        delimiter,
      });
    },
  };
}

/**
 * Returns a Firebase Rules validator returns true iff a valid OAuth (admin) credential
 * is available. This validator does *not* check Firebase Rules directly.
 */
export function getAdminOnlyFirebaseRulesValidator(): FirebaseRulesValidator {
  return {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    validate: (
      _path: string,
      _bucketId: string,
      _method: RulesetOperationMethod,
      _variableOverrides: RulesVariableOverrides,
      _authorization?: string,
      delimiter?: string,
    ) => {
      // TODO(tonyjhuang): This should check for valid admin credentials some day.
      // Unfortunately today, there's no easy way to set up the GCS SDK to pass
      // "Bearer owner" along with requests so this is a placeholder.
      return Promise.resolve(true);
    },
    /* eslint-enable @typescript-eslint/no-unused-vars */
  };
}

/**
 * Returns a validator for OAuth (admin) credentials. This typically takes the shape of
 * "Authorization: Bearer owner" headers.
 */
export function getAdminCredentialValidator(): AdminCredentialValidator {
  return { validate: isValidAdminCredentials };
}

/** Authorizes file access based on security rules. */
export async function isPermitted(opts: {
  ruleset?: StorageRulesetInstance;
  file: {
    before?: RulesResourceMetadata;
    after?: RulesResourceMetadata;
  };
  path: string;
  method: RulesetOperationMethod;
  projectId: string;
  authorization?: string;
  delimiter?: string;
}): Promise<boolean> {
  if (!opts.ruleset) {
    EmulatorLogger.forEmulator(Emulators.STORAGE).log(
      "WARN",
      `Can not process SDK request with no loaded ruleset`,
    );
    return false;
  }

  // Skip auth for UI
  if (isValidAdminCredentials(opts.authorization)) {
    return true;
  }

  const { permitted, issues } = await opts.ruleset.verify({
    method: opts.method,
    path: opts.path,
    file: opts.file,
    projectId: opts.projectId,
    token: opts.authorization ? opts.authorization.split(" ")[1] : undefined,
    delimiter: opts.delimiter,
  });

  if (issues.exist()) {
    issues.all.forEach((warningOrError) => {
      EmulatorLogger.forEmulator(Emulators.STORAGE).log("WARN", warningOrError);
    });
  }

  return !!permitted;
}

function isValidAdminCredentials(authorization?: string) {
  return ["Bearer owner", "Firebase owner"].includes(authorization ?? "");
}
