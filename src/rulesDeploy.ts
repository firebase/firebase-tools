import _ = require("lodash");
import clc = require("cli-color");
import fs = require("fs");

import gcp = require("./gcp");
import { logger } from "./logger";
import { FirebaseError } from "./error";
import utils = require("./utils");

import { promptOnce } from "./prompt";
import { ListRulesetsEntry, Release, RulesetFile } from "./gcp/rules";

// The status code the Firebase Rules backend sends to indicate too many rulesets.
const QUOTA_EXCEEDED_STATUS_CODE = 429;

// How many old rulesets is enough to cause problems?
const RULESET_COUNT_LIMIT = 1000;

// how many old rulesets should we delete to free up quota?
const RULESETS_TO_GC = 10;

/**
 * Services that have rulesets.
 */
export enum RulesetServiceType {
  CLOUD_FIRESTORE = "cloud.firestore",
  FIREBASE_STORAGE = "firebase.storage",
}

/**
 * Printable names of RulesetServiceTypes.
 */
const RulesetType = {
  [RulesetServiceType.CLOUD_FIRESTORE]: "firestore",
  [RulesetServiceType.FIREBASE_STORAGE]: "storage",
};

/**
 * RulesDeploy encapsulates logic for deploying rules.
 */
export class RulesDeploy {
  private project: string;
  private rulesFiles: { [path: string]: RulesetFile[] };
  private rulesetNames: { [x: string]: string };

  /**
   * Creates a RulesDeploy instance.
   * @param options The CLI options object.
   * @param type The service type for which this ruleset is associated.
   */
  constructor(public options: any, private type: RulesetServiceType) {
    this.project = options.project;
    this.rulesFiles = {};
    this.rulesetNames = {};
  }

  /**
   * Adds a new project-relative file to be included in compilation and
   * deployment for this RulesDeploy.
   * @param path path of file to be included.
   */
  addFile(path: string): void {
    const fullPath = this.options.config.path(path);
    let src;
    try {
      src = fs.readFileSync(fullPath, "utf8");
    } catch (e: any) {
      logger.debug("[rules read error]", e.stack);
      throw new FirebaseError("Error reading rules file " + clc.bold(path));
    }

    this.rulesFiles[path] = [{ name: path, content: src }];
  }

  /**
   * Compile all rulesets tied to this deploy, rejecting on first
   * compilation error.
   */
  async compile(): Promise<void> {
    await Promise.all(
      Object.keys(this.rulesFiles).map((filename) => {
        return this.compileRuleset(filename, this.rulesFiles[filename]);
      })
    );
  }

  /**
   * Returns the latest ruleset's name and content.
   * @param service The service to fetch the rulesets.
   * @return An object containing the latest name and content of the current rules.
   */
  private async getCurrentRules(
    service: RulesetServiceType
  ): Promise<{ latestName: string | null; latestContent: RulesetFile[] | null }> {
    const latestName = await gcp.rules.getLatestRulesetName(this.options.project, service);
    let latestContent: RulesetFile[] | null = null;
    if (latestName) {
      latestContent = await gcp.rules.getRulesetContent(latestName);
    }
    return { latestName, latestContent };
  }

  /**
   * Create rulesets for each file added to this deploy, and record
   * the name for use in the release process later.
   *
   * If the ruleset to create is identical to the latest existing ruleset,
   * then we record the existing ruleset name instead of creating a duplicate.
   *
   * @param service The service to create a ruleset.
   * @return All the names of the rulesets that were created.
   */
  async createRulesets(service: RulesetServiceType): Promise<string[]> {
    const createdRulesetNames: string[] = [];

    const { latestName: latestRulesetName, latestContent: latestRulesetContent } =
      await this.getCurrentRules(service);

    // TODO: Make this into a more useful helper method.
    // Gather the files to be uploaded.
    const newRulesetsByFilename = new Map<string, Promise<string>>();
    for (const filename of Object.keys(this.rulesFiles)) {
      const files = this.rulesFiles[filename];
      if (latestRulesetName && _.isEqual(files, latestRulesetContent)) {
        utils.logBullet(
          `${clc.bold.cyan(RulesetType[this.type] + ":")} latest version of ${clc.bold(
            filename
          )} already up to date, skipping upload...`
        );
        this.rulesetNames[filename] = latestRulesetName;
        continue;
      }
      utils.logBullet(
        `${clc.bold.cyan(RulesetType[this.type] + ":")} uploading rules ${clc.bold(filename)}...`
      );
      newRulesetsByFilename.set(filename, gcp.rules.createRuleset(this.options.project, files));
    }

    try {
      await Promise.all(newRulesetsByFilename.values());
      // All the values are now resolves, so `await` here reads the strings.
      for (const [filename, rulesetName] of newRulesetsByFilename) {
        this.rulesetNames[filename] = await rulesetName;
        createdRulesetNames.push(await rulesetName);
      }
    } catch (err: any) {
      if (err.status !== QUOTA_EXCEEDED_STATUS_CODE) {
        throw err;
      }
      utils.logBullet(
        clc.bold.yellow(RulesetType[this.type] + ":") +
          " quota exceeded error while uploading rules"
      );

      const history: ListRulesetsEntry[] = await gcp.rules.listAllRulesets(this.options.project);

      if (history.length > RULESET_COUNT_LIMIT) {
        const confirm = await promptOnce(
          {
            type: "confirm",
            name: "force",
            message: `You have ${history.length} rules, do you want to delete the oldest ${RULESETS_TO_GC} to free up space?`,
            default: false,
          },
          this.options
        );
        if (confirm) {
          // Find the oldest unreleased rulesets. The rulesets are sorted reverse-chronlogically.
          const releases: Release[] = await gcp.rules.listAllReleases(this.options.project);
          const unreleased: ListRulesetsEntry[] = _.reject(
            history,
            (ruleset: ListRulesetsEntry): boolean => {
              return !!releases.find((release) => release.rulesetName === ruleset.name);
            }
          );
          const entriesToDelete = unreleased.reverse().slice(0, RULESETS_TO_GC);
          // To avoid running into quota issues, delete entries in _serial_ rather than parallel.
          for (const entry of entriesToDelete) {
            await gcp.rules.deleteRuleset(this.options.project, gcp.rules.getRulesetId(entry));
            logger.debug(`[rules] Deleted ${entry.name}`);
          }
          utils.logBullet(clc.bold.yellow(RulesetType[this.type] + ":") + " retrying rules upload");
          return this.createRulesets(service);
        }
      }
    }
    return createdRulesetNames;
  }

  /**
   * Releases the rules from the given file and resource name.
   * @param filename The filename to release.
   * @param resourceName The release name to release these as.
   * @param subResourceName An optional sub-resource name to append to the
   *   release name. This is required if resourceName === FIREBASE_STORAGE.
   */
  async release(
    filename: string,
    resourceName: RulesetServiceType,
    subResourceName?: string
  ): Promise<void> {
    // Cast as a RulesetServiceType to test the value against known types.
    if (resourceName === RulesetServiceType.FIREBASE_STORAGE && !subResourceName) {
      throw new FirebaseError(`Cannot release resource type "${resourceName}"`);
    }
    await gcp.rules.updateOrCreateRelease(
      this.options.project,
      this.rulesetNames[filename],
      resourceName === RulesetServiceType.FIREBASE_STORAGE
        ? `${resourceName}/${subResourceName}`
        : resourceName
    );
    utils.logSuccess(
      `${clc.bold.green(RulesetType[this.type] + ":")} released rules ${clc.bold(
        filename
      )} to ${clc.bold(resourceName)}`
    );
  }

  /**
   * Attempts to compile a ruleset.
   * @param filename The filename to compile.
   * @param files The files to compile.
   */
  private async compileRuleset(filename: string, files: RulesetFile[]): Promise<void> {
    utils.logBullet(
      `${clc.bold.cyan(this.type + ":")} checking ${clc.bold(filename)} for compilation errors...`
    );
    const response = await gcp.rules.testRuleset(this.options.project, files);
    if (_.get(response, "body.issues", []).length) {
      const warnings: string[] = [];
      const errors: string[] = [];
      response.body.issues.forEach((issue: any) => {
        const issueMessage = `[${issue.severity.substring(0, 1)}] ${issue.sourcePosition.line}:${
          issue.sourcePosition.column
        } - ${issue.description}`;

        if (issue.severity === "ERROR") {
          errors.push(issueMessage);
        } else {
          warnings.push(issueMessage);
        }
      });

      if (warnings.length > 0) {
        warnings.forEach((warning) => {
          utils.logWarning(warning);
        });
      }

      if (errors.length > 0) {
        const add = errors.length === 1 ? "" : "s";
        const message = `Compilation error${add} in ${clc.bold(filename)}:\n${errors.join("\n")}`;
        throw new FirebaseError(message, { exit: 1 });
      }
    }

    utils.logSuccess(
      `${clc.bold.green(this.type + ":")} rules file ${clc.bold(filename)} compiled successfully`
    );
  }
}
