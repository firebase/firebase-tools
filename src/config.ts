"use strict";

import { FirebaseConfig } from "./firebaseConfig";

import * as _ from "lodash";
import * as clc from "cli-color";
import * as fs from "fs-extra";
import * as path from "path";
const cjson = require("cjson");

import { detectProjectRoot } from "./detectProjectRoot";
import { FirebaseError } from "./error";
import * as fsutils from "./fsutils";
import { promptOnce } from "./prompt";
import { resolveProjectPath } from "./projectPath";
import * as utils from "./utils";
import { getValidator, getErrorMessage } from "./firebaseConfigValidate";
import { logger } from "./logger";
const loadCJSON = require("./loadCJSON");
const parseBoltRules = require("./parseBoltRules");

export class Config {
  static DEFAULT_FUNCTIONS_SOURCE = "functions";

  static FILENAME = "firebase.json";
  static MATERIALIZE_TARGETS: Array<keyof FirebaseConfig> = [
    "database",
    "emulators",
    "firestore",
    "functions",
    "hosting",
    "storage",
    "remoteconfig",
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
  constructor(src: any, options: any) {
    this.options = options || {};
    this.projectDir = options.projectDir || detectProjectRoot(options);
    this._src = src;

    if (this._src.firebase) {
      this.defaults.project = this._src.firebase;
      utils.logWarning(
        clc.bold('"firebase"') +
          " key in firebase.json is deprecated. Run " +
          clc.bold("firebase use --add") +
          " instead"
      );
    }

    // Move the deprecated top-level "rules" ket into the "database" object
    if (_.has(this._src, "rules")) {
      _.set(this._src, "database.rules", this._src.rules);
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

    // Auto-detect functions from package.json in directory
    if (
      this.projectDir &&
      !this.get("functions.source") &&
      fsutils.dirExistsSync(this.path("functions"))
    ) {
      this.set("functions.source", Config.DEFAULT_FUNCTIONS_SOURCE);
    }
  }

  materialize(target: string) {
    const val = _.get(this._src, target);
    if (typeof val === "string") {
      let out = this.parseFile(target, val);
      // if e.g. rules.json has {"rules": {}} use that
      const segments = target.split(".");
      const lastSegment = segments[segments.length - 1];
      if (Object.keys(out).length === 1 && _.has(out, lastSegment)) {
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
          } catch (e) {
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
          { exit: 1 }
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

  has(key: string) {
    return _.has(this.data, key);
  }

  path(pathName: string) {
    const outPath = path.normalize(path.join(this.projectDir, pathName));
    if (path.relative(this.projectDir, outPath).includes("..")) {
      throw new FirebaseError(clc.bold(pathName) + " is outside of project directory", { exit: 1 });
    }
    return outPath;
  }

  readProjectFile(p: string, options: any) {
    options = options || {};
    try {
      const content = fs.readFileSync(this.path(p), "utf8");
      if (options.json) {
        return JSON.parse(content);
      }
      return content;
    } catch (e) {
      if (options.fallback) {
        return options.fallback;
      }
      if (e.code === "ENOENT") {
        throw new FirebaseError(`File not found: ${this.path(p)}`, { original: e });
      }
      throw e;
    }
  }

  writeProjectFile(p: string, content: any) {
    if (typeof content !== "string") {
      content = JSON.stringify(content, null, 2) + "\n";
    }

    fs.ensureFileSync(this.path(p));
    fs.writeFileSync(this.path(p), content, "utf8");
  }

  askWriteProjectFile(p: string, content: any) {
    const writeTo = this.path(p);
    let next;
    if (fsutils.fileExistsSync(writeTo)) {
      next = promptOnce({
        type: "confirm",
        message: "File " + clc.underline(p) + " already exists. Overwrite?",
        default: false,
      });
    } else {
      next = Promise.resolve(true);
    }

    return next.then((result: boolean) => {
      if (result) {
        this.writeProjectFile(p, content);
        utils.logSuccess("Wrote " + clc.bold(p));
      } else {
        utils.logBullet("Skipping write of " + clc.bold(p));
      }
    });
  }

  public static load(options: any, allowMissing?: boolean) {
    const pd = detectProjectRoot(options);
    const filename = options.configPath || Config.FILENAME;
    if (pd) {
      try {
        const filePath = path.resolve(pd, path.basename(filename));
        const data = cjson.load(filePath);

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
      } catch (e) {
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
    });
  }
}
