import { StorageRulesetInstance } from "./runtime";
import { RulesResourceMetadata } from "../metadata";
import { RulesetOperationMethod } from "./types";
import { EmulatorLogger } from "../../emulatorLogger";
import { Emulators } from "../../types";

/** Authorizes file access given a set of security rules. */
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
