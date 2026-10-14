import * as _ from "lodash";
import * as clc from "colorette";

import { FirebaseError } from "./error";
import * as functionsConfig from "./functionsConfig";
import * as runtimeconfig from "./gcp/runtimeconfig";

// Tests whether short is a prefix of long
function matchPrefix(short: any[], long: any[]): boolean {
  if (short.length > long.length) {
    return false;
  }
  return short.reduce((accum, x, i) => accum && x === long[i], true);
}

function applyExcept(json: any, except: any[]) {
  for (const key of except) {
    _.unset(json, key);
  }
}

function cloneVariable(varName: string, toProject: any): Promise<any> {
  return runtimeconfig.variables.get(varName).then((variable) => {
    const id = functionsConfig.varNameToIds(variable.name);
    return runtimeconfig.variables.set(toProject, id.config, id.variable, variable.text);
  });
}

function cloneConfig(configName: string, toProject: any): Promise<any> {
  return runtimeconfig.variables.list(configName).then((variables) => {
    return Promise.all(
      variables.map((variable: { name: string }) => {
        return cloneVariable(variable.name, toProject);
      }),
    );
  });
}

async function cloneConfigOrVariable(key: string, fromProject: any, toProject: any): Promise<any> {
  const parts = key.split(".");
  if (functionsConfig.RESERVED_NAMESPACES.includes(parts[0])) {
    throw new FirebaseError("Cannot clone reserved namespace " + clc.bold(parts[0]));
  }
  const configName = ["projects", fromProject, "configs", parts[0]].join("/");
  if (parts.length === 1) {
    return cloneConfig(configName, toProject);
  }
  return runtimeconfig.variables.list(configName).then((variables) => {
    const promises: Promise<any>[] = [];
    for (const variable of variables) {
      const varId = functionsConfig.varNameToIds(variable.name).variable;
      const variablePrefixFilter = parts.slice(1);
      if (matchPrefix(variablePrefixFilter, varId.split("/"))) {
        promises.push(cloneVariable(variable.name, toProject));
      }
    }
    return Promise.all(promises);
  });
}

export async function functionsConfigClone(
  fromProject: any,
  toProject: any,
  only: string[] | undefined,
  except: string[] = [],
): Promise<any> {
  if (only) {
    return Promise.all(
      only.map((key) => {
        return cloneConfigOrVariable(key, fromProject, toProject);
      }),
    );
  }
  return functionsConfig.materializeAll(fromProject).then((toClone) => {
    _.unset(toClone, "firebase"); // Do not clone firebase config
    applyExcept(toClone, except);
    return Promise.all(
      Object.entries(toClone).map(([configId, val]) => {
        return functionsConfig.setVariablesRecursive(toProject, configId, "", val);
      }),
    );
  });
}
