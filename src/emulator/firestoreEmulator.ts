import * as chokidar from "chokidar";
import * as fs from "fs";
import * as clc from "colorette";
import * as path from "path";

import * as utils from "../utils";
import * as downloadableEmulators from "./downloadableEmulators";
import { EmulatorInfo, EmulatorInstance, Emulators, Severity } from "../emulator/types";
import { EmulatorRegistry } from "./registry";
import { Constants } from "./constants";
import { Issue } from "./types";

export interface FirestoreEmulatorArgs {
  port?: number;
  host?: string;
  websocket_port?: number;
  project_id?: string;
  rules?: string;
  functions_emulator?: string;
  auto_download?: boolean;
  seed_from_export?: string;
  single_project_mode?: boolean;
  single_project_mode_error?: boolean;
}

export interface FirestoreEmulatorInfo extends EmulatorInfo {
  // Used for the Emulator UI to connect to the WebSocket server.
  // The casing of the fields below is sensitive and important.
  // https://github.com/firebase/firebase-tools-ui/blob/2de1e80cce28454da3afeeb373fbbb45a67cb5ef/src/store/config/types.ts#L26-L27
  webSocketHost?: string;
  webSocketPort?: number;
}

export class FirestoreEmulator implements EmulatorInstance {
  rulesWatcher?: chokidar.FSWatcher;

  constructor(private args: FirestoreEmulatorArgs) {}

  async start(): Promise<void> {
    if (EmulatorRegistry.isRunning(Emulators.FUNCTIONS)) {
      this.args.functions_emulator = EmulatorRegistry.url(Emulators.FUNCTIONS).host;
    }

    if (this.args.rules && this.args.project_id) {
      const rulesPath = this.args.rules;
      this.rulesWatcher = chokidar.watch(rulesPath, { persistent: true, ignoreInitial: true });
      this.rulesWatcher.on("change", async () => {
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

  getInfo(): FirestoreEmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost();
    const port = this.args.port || Constants.getDefaultPort(Emulators.FIRESTORE);
    const reservedPorts = this.args.websocket_port ? [this.args.websocket_port] : [];

    return {
      name: this.getName(),
      host,
      port,
      pid: downloadableEmulators.getPID(Emulators.FIRESTORE),
      reservedPorts: reservedPorts,
      webSocketHost: this.args.websocket_port ? host : undefined,
      webSocketPort: this.args.websocket_port ? this.args.websocket_port : undefined,
    };
  }

  getName(): Emulators {
    return Emulators.FIRESTORE;
  }

  private async updateRules(content: string): Promise<Issue[]> {
    const projectId = this.args.project_id;

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

    const res = await EmulatorRegistry.client(Emulators.FIRESTORE).put<any, { issues?: Issue[] }>(
      `/emulator/v1/projects/${projectId}:securityRules`,
      body,
    );
    if (res.body && Array.isArray(res.body.issues)) {
      return res.body.issues;
    }
    return [];
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
      issue.severity,
    )} ${issue.description}`;
  }
}
