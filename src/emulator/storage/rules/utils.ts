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
export interface RulesValidator {
  validate(
    path: string,
    bucketId: string,
    method: RulesetOperationMethod,
    variableOverrides: RulesVariableOverrides,
    authorization?: string
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
export function getRulesValidator(rulesetProvider: RulesetProvider): RulesValidator {
  return {
    validate: async (
      path: string,
      bucketId: string,
      method: RulesetOperationMethod,
      variableOverrides: RulesVariableOverrides,
      authorization?: string
    ) => {
      return await isPermitted({
        ruleset: rulesetProvider(bucketId),
        file: variableOverrides,
        path,
        method,
        authorization,
      });
    },
  };
}

/** Returns a validator for admin credentials. */
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
  authorization?: string;
}): Promise<boolean> {
  if (!opts.ruleset) {
    EmulatorLogger.forEmulator(Emulators.STORAGE).log(
      "WARN",
      `Can not process SDK request with no loaded ruleset`
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
    token: opts.authorization ? opts.authorization.split(" ")[1] : undefined,
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
