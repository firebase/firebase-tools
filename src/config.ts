"use strict";

import { FirebaseConfig } from "./firebaseConfig";

import * as _ from "lodash";
import * as clc from "colorette";
import * as fs from "fs-extra";
import * as path from "path";

import { detectProjectRoot } from "./detectProjectRoot";
import { FirebaseError } from "./error";
import * as fsutils from "./fsutils";
import { confirm } from "./prompt";
import { resolveProjectPath } from "./projectPath";
import * as utils from "./utils";
import { getValidator, getErrorMessage } from "./firebaseConfigValidate";
import { logger } from "./logger";
import { loadCJSON } from "./loadCJSON";
const parseBoltRules = require("./parseBoltRules");

export class Config {
  static DEFAULT_FUNCTIONS_SOURCE = "functions";

  static FILENAME = "firebase.json";
  static MATERIALIZE_TARGETS: Array<keyof FirebaseConfig> = [
    "database",
    "emulators",
    "extensions",
    "firestore",
    "functions",
    "hosting",
    "storage",
    "remoteconfig",
    "dataconnect",
    "apphosting",
  ];

  public options: any;
  public projectDir: string;
  public data: any = {};
  public defaults: any = {};
  public notes: any = {};

  private _src: any;

  /**
   * @param src incoming firebase.json source, parsed by not validated.
   * @param options command-line options.
   */
  constructor(src: any, options: any = {}) {
    this.options = options;
    this.projectDir = this.options.projectDir || detectProjectRoot(this.options);
    this._src = src;

    if (this._src.firebase) {
      this.defaults.project = this._src.firebase;
      utils.logWarning(
        clc.bold('"firebase"') +
          " key in firebase.json is deprecated. Run " +
          clc.bold("firebase use --add") +
          " instead",
      );
    }

    // Move the deprecated top-level "rules" key into the "database" object
    if (this._src?.rules) {
      this._src.database = { ...this._src.database, rules: this._src.rules };
    }

    // If a top-level key contains a string path pointing to a suported file
    // type (JSON or Bolt), we read the file.
    //
    // TODO: This is janky and confusing behavior, we should remove it ASAP.
    Config.MATERIALIZE_TARGETS.forEach((target) => {
      if (_.get(this._src, target)) {
        _.set(this.data, target, this.materialize(target));
      }
    });

    // Inject default functions source if missing, but only when a given entry has
    // neither a local source nor a remoteSource configured.
    if (this.get("functions")) {
      if (this.projectDir && fsutils.dirExistsSync(this.path(Config.DEFAULT_FUNCTIONS_SOURCE))) {
        const funcs = this.get("functions");
        if (Array.isArray(funcs)) {
          // Inject default source for exactly one empty entry (the first empty),
          // preserving legacy convenience while avoiding ambiguity when multiple are empty.
          let emptyIdx: number | undefined;
          for (let i = 0; i < funcs.length; i++) {
            const hasSource = this.get(`functions.[${i}].source`);
            const hasRemote = this.get(`functions.[${i}].remoteSource`);
            if (!hasSource && !hasRemote) {
              emptyIdx = i;
              break; // inject into the first empty entry only
            }
          }
          if (emptyIdx !== undefined) {
            this.set(`functions.[${emptyIdx}].source`, Config.DEFAULT_FUNCTIONS_SOURCE);
          }
        } else {
          const hasSource = this.get("functions.source");
          const hasRemote = this.get("functions.remoteSource");
          if (!hasSource && !hasRemote) {
            this.set("functions.source", Config.DEFAULT_FUNCTIONS_SOURCE);
          }
        }
      }
    }

    if (
      this._src.dataconnect?.location ||
      (Array.isArray(this._src.dataconnect) && this._src.dataconnect.some((c: any) => c?.location))
    ) {
      utils.logLabeledWarning(
        "dataconnect",
        "'location' has been moved from 'firebase.json' to 'dataconnect.yaml'. " +
          "Please remove 'dataconnect.location' from 'firebase.json' and add it as top level field to 'dataconnect.yaml' instead ",
      );
    }
  }

  materialize(target: string) {
    const val = _.get(this._src, target);
    if (typeof val === "string") {
      let out = this.parseFile(target, val);
      // if e.g. rules.json has {"rules": {}} use that
      const segments = target.split(".");
      const lastSegment = segments[segments.length - 1];
      if (Object.keys(out).length === 1 && out[lastSegment]) {
        out = out[lastSegment];
      }
      return out;
    } else if (val !== null && typeof val === "object") {
      return val;
    }

    throw new FirebaseError('Parse Error: "' + target + '" must be object or import path', {
      exit: 1,
    });
  }

  parseFile(target: string, filePath: string) {
    const fullPath = resolveProjectPath(this.options, filePath);
    const ext = path.extname(filePath);
    if (!fsutils.fileExistsSync(fullPath)) {
      throw new FirebaseError("Parse Error: Imported file " + filePath + " does not exist", {
        exit: 1,
      });
    }

    switch (ext) {
      case ".json":
        if (target === "database") {
          this.notes.databaseRules = "json";
        } else if (target === "database.rules") {
          this.notes.databaseRulesFile = filePath;
          try {
            return fs.readFileSync(fullPath, "utf8");
          } catch (e: any) {
            if (e.code === "ENOENT") {
              throw new FirebaseError(`File not found: ${fullPath}`, { original: e });
            }
            throw e;
          }
        }
        return loadCJSON(fullPath);
      /* istanbul ignore-next */
      case ".bolt":
        if (target === "database") {
          this.notes.databaseRules = "bolt";
        }
        return parseBoltRules(fullPath);
      default:
        throw new FirebaseError(
          "Parse Error: " + filePath + " is not of a supported config file type",
          { exit: 1 },
        );
    }
  }

  get src(): FirebaseConfig {
    // TODO(samstern): We should do JSON Schema validation on this at load time
    // and then make the _src type stronger.
    return this._src as FirebaseConfig;
  }

  get(key: string, fallback?: any) {
    return _.get(this.data, key, fallback);
  }

  set(key: string, value: any) {
    // TODO: We should really remove all instances of config.set() around the
    //       codebase but until we do we need this to prevent src from going stale.
    _.set(this._src, key, value);

    return _.set(this.data, key, value);
  }

  has(key: string): boolean {
    return _.has(this.data, key);
  }

  path(pathName: string) {
    if (path.isAbsolute(pathName)) {
      return pathName;
    }
    const outPath = path.normalize(path.join(this.projectDir, pathName));
    if (path.relative(this.projectDir, outPath).includes("..")) {
      throw new FirebaseError(clc.bold(pathName) + " is outside of project directory", { exit: 1 });
    }
    return outPath;
  }

  readProjectFile(p: string, options: { json?: boolean; fallback?: any } = {}) {
    options = options || {};
    try {
      const content = fs.readFileSync(this.path(p), "utf8");
      if (options.json) {
        return JSON.parse(content);
      }
      return content;
    } catch (e: any) {
      if (options.fallback) {
        return options.fallback;
      }
      if (e.code === "ENOENT") {
        throw new FirebaseError(`File not found: ${this.path(p)}`, { original: e });
      }
      throw e;
    }
  }

  writeProjectFile(p: string, content: any): void {
    const path = this.path(p);
    fs.ensureFileSync(path);
    fs.writeFileSync(path, stringifyContent(content), "utf8");
    switch (p) {
      case "firebase.json":
        utils.logSuccess("Wrote configuration info to " + clc.bold("firebase.json"));
        break;
      case ".firebaserc":
        utils.logSuccess("Wrote project information to " + clc.bold(".firebaserc"));
        break;
      default:
        utils.logSuccess("Wrote " + clc.bold(p));
        break;
    }
  }

  projectFileExists(p: string): boolean {
    return fs.existsSync(this.path(p));
  }

  deleteProjectFile(p: string) {
    fs.removeSync(this.path(p));
  }

  async confirmWriteProjectFile(
    path: string,
    content: any,
    confirmByDefault?: boolean,
  ): Promise<boolean> {
    const writeTo = this.path(path);
    if (!fsutils.fileExistsSync(writeTo)) {
      return true;
    }
    const existingContent = fsutils.readFile(writeTo);
    const newContent = stringifyContent(content);
    if (existingContent === newContent) {
      utils.logBullet(clc.bold(path) + " is unchanged");
      return false;
    }
    const shouldWrite = await confirm({
      message: "File " + clc.underline(path) + " already exists. Overwrite?",
      default: !!confirmByDefault,
    });
    if (!shouldWrite) {
      utils.logBullet("Skipping write of " + clc.bold(path));
      return false;
    }
    return true;
  }

  async askWriteProjectFile(
    path: string,
    content: any,
    force?: boolean,
    confirmByDefault?: boolean,
  ): Promise<void> {
    if (!force) {
      const shouldWrite = await this.confirmWriteProjectFile(path, content, confirmByDefault);
      if (!shouldWrite) {
        return;
      }
    }
    this.writeProjectFile(path, content);
  }

  public static load(options: any, allowMissing?: boolean): Config | null {
    const pd = detectProjectRoot(options);
    const filename = options.configPath || Config.FILENAME;
    if (pd) {
      try {
        const filePath = path.resolve(pd, path.basename(filename));
        let data: unknown = {};
        if (fs.readFileSync(filePath, "utf-8") !== "") {
          data = loadCJSON(filePath);
        }

        // Validate config against JSON Schema. For now we just print these to debug
        // logs but in a future CLI version they could be warnings and/or errors.
        const validator = getValidator();
        const valid = validator(data);
        if (!valid && validator.errors) {
          for (const e of validator.errors) {
            // TODO: We should probably collapse these errors on the 'dataPath' property
            //       and then pick out the most important error on each field. Otherwise
            //       some simple mistakes can cause 2-3 errors.
            logger.debug(getErrorMessage(e));
          }
        }

        return new Config(data, options);
      } catch (e: any) {
        throw new FirebaseError(`There was an error loading ${filename}:\n\n` + e.message, {
          exit: 1,
        });
      }
    }

    if (allowMissing) {
      return null;
    }

    throw new FirebaseError("Not in a Firebase app directory (could not locate firebase.json)", {
      exit: 1,
      status: 404,
    });
  }
}

function stringifyContent(content: any): string {
  if (typeof content === "string") {
    return content;
  }
  return JSON.stringify(content, null, 2) + "\n";
}
