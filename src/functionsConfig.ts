import * as _ from "lodash";
import * as clc from "cli-color";

import { firebaseApiOrigin } from "./api";
import { Client } from "./apiv2";
import { ensure as ensureApiEnabled } from "./ensureApiEnabled";
import { FirebaseError } from "./error";
import { needProjectId } from "./projectUtils";
import * as runtimeconfig from "./gcp/runtimeconfig";
import * as args from "./deploy/functions/args";

export const RESERVED_NAMESPACES = ["firebase"];

const apiClient = new Client({ urlPrefix: firebaseApiOrigin });

interface Id {
  config: string;
  variable: string;
}
function keyToIds(key: string): Id {
  const keyParts = key.split(".");
  const variable = keyParts.slice(1).join("/");
  return {
    config: keyParts[0],
    variable: variable,
  };
}

function setVariable(
  projectId: string,
  configId: string,
  varPath: string,
  val: string | object
): Promise<any> {
  if (configId === "" || varPath === "") {
    const msg = "Invalid argument, each config value must have a 2-part key (e.g. foo.bar).";
    throw new FirebaseError(msg);
  }
  return runtimeconfig.variables.set(projectId, configId, varPath, val);
}

function isReservedNamespace(id: Id) {
  return _.some(RESERVED_NAMESPACES, (reserved) => {
    return id.config.toLowerCase().startsWith(reserved);
  });
}

export async function ensureApi(options: any): Promise<void> {
  const projectId = needProjectId(options);
  return ensureApiEnabled(projectId, "runtimeconfig.googleapis.com", "runtimeconfig", true);
}

export function varNameToIds(varName: string): Id {
  return {
    config: varName.match(new RegExp("/configs/(.+)/variables/"))![1],
    variable: varName.match(new RegExp("/variables/(.+)"))![1],
  };
}

export function idsToVarName(projectId: string, configId: string, varId: string): string {
  return _.join(["projects", projectId, "configs", configId, "variables", varId], "/");
}

// TODO(inlined): Yank and inline into Fabricator
export function getAppEngineLocation(config: any): string {
  let appEngineLocation = config.locationId;
  if (appEngineLocation && appEngineLocation.match(/[^\d]$/)) {
    // For some regions, such as us-central1, the locationId has the trailing digit cut off
    appEngineLocation = appEngineLocation + "1";
  }
  return appEngineLocation || "us-central1";
}

export async function getFirebaseConfig(options: any): Promise<args.FirebaseConfig> {
  const projectId = needProjectId(options);
  const response = await apiClient.get<args.FirebaseConfig>(
    `/v1beta1/projects/${projectId}/adminSdkConfig`
  );
  return response.body;
}

// If you make changes to this function, run "node scripts/test-functions-config.js"
// to ensure that nothing broke.
export async function setVariablesRecursive(
  projectId: string,
  configId: string,
  varPath: string,
  val: string | { [key: string]: any }
): Promise<any> {
  let parsed = val;
  if (_.isString(val)) {
    try {
      // Only attempt to parse 'val' if it is a String (takes care of unparsed JSON, numbers, quoted string, etc.)
      parsed = JSON.parse(val);
    } catch (e: any) {
      // 'val' is just a String
    }
  }
  // If 'parsed' is object, call again
  if (_.isPlainObject(parsed)) {
    return Promise.all(
      _.map(parsed, (item: any, key: string) => {
        const newVarPath = varPath ? _.join([varPath, key], "/") : key;
        return setVariablesRecursive(projectId, configId, newVarPath, item);
      })
    );
  }

  // 'val' wasn't more JSON, i.e. is a leaf node; set and return
  return setVariable(projectId, configId, varPath, val);
}

export async function materializeConfig(configName: string, output: any): Promise<any> {
  const materializeVariable = async function (varName: string) {
    const variable = await runtimeconfig.variables.get(varName);
    const id = exports.varNameToIds(variable.name);
    const key = id.config + "." + id.variable.split("/").join(".");
    _.set(output, key, variable.text);
  };

  const traverseVariables = async function (variables: any) {
    return Promise.all(
      _.map(variables, (variable) => {
        return materializeVariable(variable.name);
      })
    );
  };

  const variables = await runtimeconfig.variables.list(configName);
  await traverseVariables(variables);
  return output;
}

export async function materializeAll(projectId: string): Promise<{ [key: string]: any }> {
  const output = {};
  const configs = await runtimeconfig.configs.list(projectId);
  await Promise.all(
    _.map(configs, (config) => {
      if (config.name.match(new RegExp("configs/firebase"))) {
        // ignore firebase config
        return;
      }
      return exports.materializeConfig(config.name, output);
    })
  );
  return output;
}

interface ParsedArg {
  configId: string;
  varId: string;
  val?: string;
}

export function parseSetArgs(args: string[]): ParsedArg[] {
  const parsed: ParsedArg[] = [];
  _.forEach(args, (arg) => {
    const parts = arg.split("=");
    const key = parts[0];
    if (parts.length < 2) {
      throw new FirebaseError("Invalid argument " + clc.bold(arg) + ", must be in key=val format");
    }
    if (/[A-Z]/.test(key)) {
      throw new FirebaseError("Invalid config name " + clc.bold(key) + ", cannot use upper case.");
    }

    const id = keyToIds(key);
    if (isReservedNamespace(id)) {
      throw new FirebaseError("Cannot set to reserved namespace " + clc.bold(id.config));
    }

    const val = parts.slice(1).join("="); // So that someone can have '=' within a variable value
    parsed.push({
      configId: id.config,
      varId: id.variable,
      val: val,
    });
  });
  return parsed;
}

export function parseUnsetArgs(args: string[]): ParsedArg[] {
  const parsed: ParsedArg[] = [];
  let splitArgs: string[] = [];
  _.forEach(args, (arg) => {
    splitArgs = _.union(splitArgs, arg.split(","));
  });

  _.forEach(splitArgs, (key) => {
    const id = keyToIds(key);
    if (isReservedNamespace(id)) {
      throw new FirebaseError("Cannot unset reserved namespace " + clc.bold(id.config));
    }

    parsed.push({
      configId: id.config,
      varId: id.variable,
    });
  });
  return parsed;
}
