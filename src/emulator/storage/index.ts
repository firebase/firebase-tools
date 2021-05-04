import * as path from "path";
import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { createApp } from "./server";
import { StorageLayer } from "./files";
import * as chokidar from "chokidar";
import { EmulatorLogger } from "../emulatorLogger";
import * as fs from "fs";
import { StorageRulesetInstance, StorageRulesRuntime } from "./rules/runtime";
import { Source } from "./rules/types";
import { FirebaseError } from "../../error";
import { getDownloadDetails } from "../downloadableEmulators";
import express = require("express");

export interface StorageEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  rules: Source | string;
  auto_download?: boolean;
}

export class StorageEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private _app?: express.Express;
  private _rulesWatcher?: chokidar.FSWatcher;
  private _rules?: StorageRulesetInstance;
  private _rulesetSource?: Source;

  private _logger = EmulatorLogger.forEmulator(Emulators.STORAGE);
  private _rulesRuntime: StorageRulesRuntime;
  private _storageLayer: StorageLayer;

  constructor(private args: StorageEmulatorArgs) {
    const downloadDetails = getDownloadDetails(Emulators.STORAGE);
    this._rulesRuntime = new StorageRulesRuntime(downloadDetails.downloadPath);
    this._storageLayer = new StorageLayer(args.projectId);
  }

  get storageLayer(): StorageLayer {
    return this._storageLayer;
  }

  get rules(): StorageRulesetInstance | undefined {
    return this._rules;
  }

  get logger(): EmulatorLogger {
    return this._logger;
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    await this._rulesRuntime.start(this.args.auto_download);
    this._app = await createApp(this.args.projectId, this);

    if (typeof this.args.rules == "string") {
      const rulesFile = this.args.rules;
      this.updateRulesSource(rulesFile);
    } else {
      this._rulesetSource = this.args.rules;
    }

    if (!this._rulesetSource || this._rulesetSource.files.length == 0) {
      throw new FirebaseError("Can not initialize Storage emulator without a rules source / file.");
    } else if (this._rulesetSource.files.length > 1) {
      throw new FirebaseError(
        "Can not initialize Storage emulator with more than one rules source / file."
      );
    }

    await this.loadRuleset();

    const rulesPath = this._rulesetSource.files[0].name;
    this._rulesWatcher = chokidar.watch(rulesPath, { persistent: true, ignoreInitial: true });
    this._rulesWatcher.on("change", async () => {
      // There have been some race conditions reported (on Windows) where reading the
      // file too quickly after the watcher fires results in an empty file being read.
      // Adding a small delay prevents that at very little cost.
      await new Promise((res) => setTimeout(res, 5));

      this._logger.logLabeled(
        "BULLET",
        "storage",
        `Change detected, updating rules for Cloud Storage...`
      );
      this.updateRulesSource(rulesPath);
      await this.loadRuleset();
    });

    const server = this._app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  private updateRulesSource(rulesFile: string): void {
    this._rulesetSource = {
      files: [
        {
          name: rulesFile,
          content: fs.readFileSync(rulesFile).toString(),
        },
      ],
    };
  }

  private async loadRuleset(): Promise<void> {
    if (!this._rulesetSource) {
      this._logger.log("WARN", "Attempting to update ruleset without a source.");
      return;
    }

    const { ruleset, issues } = await this._rulesRuntime.loadRuleset(this._rulesetSource);

    if (!ruleset) {
      issues.all.forEach((issue) => {
        let parsedIssue;
        try {
          parsedIssue = JSON.parse(issue);
        } catch {
          // Parse manually
        }

        if (parsedIssue) {
          this._logger.log(
            "WARN",
            `${parsedIssue.description_.replace(/\.$/, "")} in ${
              parsedIssue.sourcePosition_.fileName_
            }:${parsedIssue.sourcePosition_.line_}`
          );
        } else {
          this._logger.log("WARN", issue);
        }
      });

      delete this._rules;
    } else {
      this._rules = ruleset;
    }
  }

  async connect(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    await this.storageLayer.deleteAll();
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.STORAGE);
    const port = this.args.port || Constants.getDefaultPort(Emulators.STORAGE);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.STORAGE;
  }

  getApp(): express.Express {
    return this._app!;
  }
}
