import * as utils from "../../utils";
import { Constants } from "../constants";
import { EmulatorInfo, EmulatorInstance, Emulators } from "../types";
import { createApp } from "./server";
import { EmulatorLogger } from "../emulatorLogger";
import express = require("express");
import * as fs from "fs";
import { FirebaseError } from "../../error";
import * as chokidar from "chokidar";
import { cloneDeep } from "lodash";

export interface RemoteConfigEmulatorArgs {
  projectId: string;
  port?: number;
  host?: string;
  template: Source | string;
}

export interface Source {
  files: SourceFile[];
}

export interface SourceFile {
  name: string;
  content: string;
}

export class RemoteConfigEmulator implements EmulatorInstance {
  private destroyServer?: () => Promise<void>;
  private _app?: express.Express;
  private _templateWatcher?: chokidar.FSWatcher;
  private _templateSource?: Source;
  private _emulatorTemplate?: any;

  private _logger = EmulatorLogger.forEmulator(Emulators.REMOTE_CONFIG);

  constructor(private args: RemoteConfigEmulatorArgs) {}

  get logger(): EmulatorLogger {
    return this._logger;
  }

  get template(): any {
    return this._emulatorTemplate;
  }

  set template(newTemplate: any) {
    this._emulatorTemplate = newTemplate;
  }

  async start(): Promise<void> {
    const { host, port } = this.getInfo();
    this._logger.logLabeled("BULLET", "remote config", `Emulator loading...`);

    this._app = await createApp(this.args.projectId, this);

    if (typeof this.args.template == "string") {
      const templateFile = this.args.template;
      this.updateTemplateSource(templateFile);
    } else {
      this._templateSource = this.args.template;
    }

    if (!this._templateSource || this._templateSource.files.length == 0) {
      throw new FirebaseError(
        "Can not initialize Remote Config emulator without a template source / file."
      );
    } else if (this._templateSource.files.length > 1) {
      throw new FirebaseError(
        "Can not initialize Remote Config emulator with more than one template source / file."
      );
    }

    this.loadTemplate(this._templateSource);

    const templatePath = this._templateSource.files[0].name;
    this._templateWatcher = chokidar.watch(templatePath, { persistent: true, ignoreInitial: true });
    this._templateWatcher.on("change", async () => {
      // There have been some race conditions reported (on Windows) where reading the
      // file too quickly after the watcher fires results in an empty file being read.
      // Adding a small delay prevents that at very little cost.
      await new Promise((res) => setTimeout(res, 5));

      this._logger.logLabeled(
        "BULLET",
        "remoteconfig",
        `Change detected, updating template for Remote Config...`
      );
      this.updateTemplateSource(templatePath);
    });

    const server = this._app.listen(port, host);
    this.destroyServer = utils.createDestroyer(server);
  }

  private loadTemplate(source?: Source): void {
    this._emulatorTemplate = RemoteConfigEmulator.prepareEmulatorTemplate(
      JSON.parse(source!.files[0].content)
    );
  }

  /**
   * Update incoming template to be used by the emulator server.
   * If necessary `!isEmulator` conditional values are added to
   * each parameter.
   *
   * @param template A valid remote config template.
   */
  static prepareEmulatorTemplate(template: any): any {
    const emulatorTemplate = cloneDeep(template);
    const emulatorParameters = emulatorTemplate["parameters"] || {};
    for (const parameterName of Object.keys(emulatorParameters)) {
      const emulatorParameter = emulatorParameters[parameterName];
      if (emulatorParameter.hasOwnProperty("conditionalValues")) {
        // add is_emulator
        const conditionalValues = emulatorParameter["conditionalValues"];
        if (!conditionalValues.hasOwnProperty("!isEmulator")) {
          conditionalValues["!isEmulator"] = Object.assign({}, emulatorParameter["defaultValue"]);
        }
      } else {
        // add conditional value object
        emulatorParameter["conditionalValues"] = {
          // add is_emulator
          "!isEmulator": Object.assign({}, emulatorParameter["defaultValue"]),
        };
      }
      emulatorParameters[parameterName] = emulatorParameter;
    }
    return emulatorTemplate;
  }

  static extractEmulator(emulatorTemplate: any): any {
    const nonEmulatorTemplate = cloneDeep(emulatorTemplate);
    const emulatorParameters = nonEmulatorTemplate["parameters"] || {};
    for (const parameterName of Object.keys(emulatorParameters)) {
      const emulatorParameter = emulatorParameters[parameterName];
      const conditionalValues = emulatorParameter["conditionalValues"];
      if (Object.values(conditionalValues).length > 1) {
        delete conditionalValues["!isEmulator"];
      } else {
        delete emulatorParameter["conditionalValues"];
      }
    }
    return nonEmulatorTemplate;
  }

  private updateTemplateSource(templateFile: string): void {
    this._templateSource = {
      files: [
        {
          name: templateFile,
          content: fs.readFileSync(templateFile).toString(),
        },
      ],
    };
  }

  async connect(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    return this.destroyServer ? this.destroyServer() : Promise.resolve();
  }

  getInfo(): EmulatorInfo {
    const host = this.args.host || Constants.getDefaultHost(Emulators.REMOTE_CONFIG);
    const port = this.args.port || Constants.getDefaultPort(Emulators.REMOTE_CONFIG);

    return {
      name: this.getName(),
      host,
      port,
    };
  }

  getName(): Emulators {
    return Emulators.REMOTE_CONFIG;
  }

  getApp(): express.Express {
    return this._app!;
  }
}
