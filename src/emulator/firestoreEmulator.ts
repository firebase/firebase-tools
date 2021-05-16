import * as chokidar from "chokidar";
import * as fs from "fs";
import * as clc from "cli-color";
import * as path from "path";

import * as api from "../api";
import * as utils from "../utils";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators, Severity } from "../emulator/types";
import { EmulatorRegistry } from "./registry";
import { Constants } from "./constants";
import { Issue } from "./types";

export interface FirestoreEmulatorArgs {
  port?: number;
  host?: string;
  projectId?: string;
  rules?: string;
  functions_emulator?: string;
  auto_download?: boolean;
  seed_from_export?: string;
}

export class FirestoreEmulator implements EmulatorInstance {
  static FIRESTORE_EMULATOR_ENV_ALT = "FIREBASE_FIRESTORE_EMULATOR_ADDRESS";

  rulesWatcher?: chokidar.FSWatcher;

  constructor(private args: FirestoreEmulatorArgs) {}

  async start(): Promise<void> {
    const functionsInfo = EmulatorRegistry.getInfo(Emulators.FUNCTIONS);
    if (functionsInfo) {
      this.args.functions_emulator = EmulatorRegistry.getInfoHostString(functionsInfo);
    }

    if (this.args.rules && this.args.projectId) {
      const rulesPath = this.args.rules;
      this.rulesWatcher = chokidar.watch(rulesPath, { persistent: true, ignoreInitial: true });
      this.rulesWatcher.on("change", async (event, stats) => {
        // There have been some race conditions reported (on Windows) where reading the
        // file too quickly after the watcher fires results in an empty file being read.
        // Adding a small delay prevents that at very little cost.
        await new Promise((res) => setTimeout(res, 5));

        utils.logLabeledBullet("firestore", "Change detected, updating rules...");
        const newContent = fs.readFileSync(rulesPath, "utf8").toString();
        const issues = await this.updateRules(newContent);
        if (issues) {
          for (const issue of issues) {
            utils.logWarning(this.prettyPrintRulesIssue(rulesPath, issue));
          }
        }
        if (issues.some((issue) => issue.severity === Severity.ERROR)) {
          utils.logWarning("Failed to update rules");
        } else {
          utils.logLabeledSuccess("firestore", "Rules updated.");
        }
      });
    }

    return downloadableEmulators.start(Emulators.FIRESTORE, this.args);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (this.rulesWatcher) {
      this.rulesWatcher.close();
    }

    return downloadableEmulators.stop(Emulators.FIRESTORE);
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.FIRESTORE);
    const port = this.args.port || Constants.getDefaultPort(Emulators.FIRESTORE);

    return {
      name: this.getName(),
      host,
      port,
      pid: downloadableEmulators.getPID(Emulators.FIRESTORE),
    };
  }

  getName(): Emulators {
    return Emulators.FIRESTORE;
  }

  private updateRules(content: string): Promise<Issue[]> {
    const projectId = this.args.projectId;

    const info = this.getInfo();
    const body = {
      // Invalid rulesets will still result in a 200 response but with more information
      ignore_errors: true,
      rules: {
        files: [
          {
            name: "security.rules",
            content,
          },
        ],
      },
    };

    return api
      .request("PUT", `/emulator/v1/projects/${projectId}:securityRules`, {
        origin: `http://${EmulatorRegistry.getInfoHostString(info)}`,
        data: body,
      })
      .then((res) => {
        if (res.body && res.body.issues) {
          return res.body.issues as Issue[];
        }

        return [];
      });
  }

  /**
   * Create a colorized and human-readable string describing a Rules validation error.
   * Ex: firestore:21:4 - ERROR expected 'if'
   */
  private prettyPrintRulesIssue(filePath: string, issue: Issue): string {
    const relativePath = path.relative(process.cwd(), filePath);
    const line = issue.sourcePosition.line || 0;
    const col = issue.sourcePosition.column || 0;
    return `${clc.cyan(relativePath)}:${clc.yellow(line)}:${clc.yellow(col)} - ${clc.red(
      issue.severity
    )} ${issue.description}`;
  }
}
