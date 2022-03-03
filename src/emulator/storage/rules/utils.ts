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
/** A simple interface for fetching Rules verdicts. */
export interface RulesValidator {
  validate(
    path: string,
    method: RulesetOperationMethod,
    variableOverrides: RulesVariableOverrides,
    authorization?: string
  ): Promise<boolean>;
}

/** Provider for Storage security rules. */
export type RulesetProvider = () => StorageRulesetInstance | undefined;

/**
 * Returns a {@link RulesValidator} that pulls a Ruleset from a
 * {@link RulesetProvider} on each run.
 */
export function getRulesValidator(rulesetProvider: RulesetProvider): RulesValidator {
  return {
    validate: (
      path: string,
      method: RulesetOperationMethod,
      variableOverrides: RulesVariableOverrides,
      authorization?: string
    ) => {
      return isPermitted({
        ruleset: rulesetProvider(),
        file: variableOverrides,
        path,
        method,
        authorization,
      });
    };
  };
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
  if (["Bearer owner", "Firebase owner"].includes(opts.authorization || "")) {
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
