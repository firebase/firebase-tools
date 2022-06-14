import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { promptOnce } from "../../prompt";
import * as build from "./build";

/**
 * Resolves a numeric field in a Build to an an actual numeric value.
 * Fields can be null, literal, or a {{ }} delimited CEL expression referencing param values.
 * Currently only the CEL literal {{ params.PARAMNAME }} is implemented.
 */
export function resolveInt(
  from: build.Field<number>,
  paramValues: Record<string, build.Field<string | number | boolean>>
): number {
  if (from == null) {
    return 0;
  } else if (typeof from === "string" && /{{ params\.(\S+) }}/.test(from)) {
    const match = /{{ params\.(\S+) }}/.exec(from);
    const referencedParamValue = paramValues[match![1]];
    if (typeof referencedParamValue !== "number") {
      throw new FirebaseError(
        "Referenced numeric parameter '" +
          match +
          "' resolved to non-number value " +
          referencedParamValue
      );
    }
    return referencedParamValue;
  } else if (typeof from === "string") {
    throw new FirebaseError("CEL evaluation of expression '" + from + "' not yet supported");
  }
  return from;
}

/**
 * Resolves a string field in a Build to an an actual string.
 * Fields can be null, literal, or a {{ }} delimited CEL expression referencing param values.
 * Currently only the CEL literal {{ params.PARAMNAME }} is implemented.
 */
export function resolveString(
  from: string | build.Expression<string> | null,
  paramValues: Record<string, build.Field<string | number | boolean>>
): string {
  if (from == null) {
    return "";
  } else if (/{{ params\.(\S+) }}/.test(from)) {
    const match = /{{ params\.(\S+) }}/.exec(from);
    const referencedParamValue = paramValues[match![1]];
    if (typeof referencedParamValue !== "string") {
      throw new FirebaseError(
        "Referenced numeric parameter '" +
          match +
          "' resolved to non-numeric value " +
          referencedParamValue
      );
    }
    return referencedParamValue;
  } else if (from.includes("{{") && from.includes("}}")) {
    throw new FirebaseError(
      "CEL evaluation of non-identity expression '" + from + "' not yet supported"
    );
  }
  return from;
}

/**
 * Resolves a boolean field in a Build to an an actual boolean value.
 * Fields can be null, literal, or a {{ }} delimited CEL expression referencing param values.
 * Currently only the CEL literal {{ params.PARAMNAME }} is implemented.
 */
export function resolveBoolean(
  from: boolean | build.Expression<boolean> | null,
  paramValues: Record<string, build.Field<string | number | boolean>>
): boolean {
  if (from == null) {
    return false;
  } else if (typeof from === "string" && /{{ params\.(\S+) }}/.test(from)) {
    const match = /{{ params\.(\S+) }}/.exec(from);
    const referencedParamValue = paramValues[match![1]];
    if (typeof referencedParamValue !== "boolean") {
      throw new FirebaseError(
        "Referenced boolean parameter '" +
          match +
          "' resolved to non-boolean value " +
          referencedParamValue
      );
    }
    return referencedParamValue;
  } else if (typeof from === "string") {
    throw new FirebaseError("CEL evaluation of expression '" + from + "' not yet supported");
  }
  return from;
}

interface ParamBase<T extends string | number | boolean> {
  // name of the param. Will be exposed as an environment variable with this name
  param: string;

  // A human friendly name for the param. Will be used in install/configure flows to describe
  // what param is being updated. If omitted, UX will use the value of "param" instead.
  label?: string;

  // A long description of the parameter's purpose and allowed values. If omitted, UX will not
  // provide a description of the parameter
  description?: string;

  // Default value. If not provided, a param must be supplied.
  default?: T | build.Expression<T>;

  // default: false
  immutable?: boolean;
}

export interface StringParam extends ParamBase<string> {
  type?: "string";

  // If omitted, defaults to TextInput<string>
  input?: TextInput<string> | SelectInput<string>;
}

export interface IntParam extends ParamBase<number> {
  type: "int";

  // If omitted, defaults to TextInput<number>
  input?: TextInput<number> | SelectInput<number>;
}

export interface TextInput<T, Extensions = {}> {
  type?: "text";

  text:
    | Extensions
    | {
        example?: string;
      };
}

interface SelectOptions<T> {
  // Optional human-facing value for this option (e.g. "US Central (Iowa)" instead of value
  // "us-central1")
  label?: string;

  // Actual value of the parameter if this option is selected
  value: T;
}

export interface SelectInput<T> {
  type?: "select";

  select: Array<SelectOptions<T>>;
}

export type Param = StringParam | IntParam;
type ParamValue = string | number | boolean;

type CEL = build.Expression<string> | build.Expression<number> | build.Expression<boolean>;
function isCEL(expr: string | number | boolean): expr is CEL {
  return typeof expr === "string" && expr.startsWith("{{") && expr.endsWith("}}");
}
function dependenciesCEL(expr: CEL): string[] {
  return /params\.(\w+)/.exec(expr)?.slice(1) || [];
}
function hasCircularDeps(
  paramName: string,
  expr: CEL,
  currentlyUnresolvedFields: Record<string, CEL>
): boolean {
  for (const dep of dependenciesCEL(expr)) {
    if (dep === paramName) {
      return true;
    }
    // This depth-1 search is sufficient for the currently implemented subset of CEL.
    // If we ever try to implement all of CEL, this may have to turn into an actual graph search.
    if (currentlyUnresolvedFields.hasOwnProperty(dep)) {
      const subexpr = currentlyUnresolvedFields[dep];
      if (dependenciesCEL(subexpr).includes(paramName)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * At the beginning, we have a set of dotenv variables (some of which are literal, and some of which are CEL),
 * and a set of params (some of which map to a dotenv literal/CEL expression, and some of which have to be prompted for).
 * There are two invariants we need to check for:
 * 1) No CEL expression can reference a field which is not defined either as a dotenv variable or a param name
 * 2) No interactive prompt can result in a CEL expression which creates a cycle in param dependencies
 */
export async function resolveParams(
  params: Param[],
  projectId: string,
  userEnvs: Record<string, ParamValue>
): Promise<Record<string, build.Field<ParamValue>>> {
  let unresolvedFields: Record<string, CEL> = {};
  const resolvedFields: Record<string, ParamValue> = {};
  const allFields: string[] = [];

  for (const env of Object.keys(userEnvs)) {
    const value = userEnvs[env];
    allFields.push(env);
    if (isCEL(value)) {
      unresolvedFields[env] = value;
    } else {
      resolvedFields[env] = value;
    }
  }
  for (const param of params) {
    allFields.push(param.param);
  }
  // for k, v in unresolvedFields: ensure that dependenciesCEL(v) is a subset of allFields
  for (const k of Object.keys(unresolvedFields)) {
    const deps = dependenciesCEL(unresolvedFields[k]);
    const allDepsFound = deps.every((dep) => {
      return allFields.includes(dep);
    });
    if (!allDepsFound) {
      throw new FirebaseError(
        "Env file CEL configuration field " +
          unresolvedFields[k] +
          " unresolvable; missing required parameters."
      );
    }
  }

  // for param of params:
  //   if param is not in dotenv keys:
  //     prompt interactively for param value
  //     if param value is CEL:
  //       ensure that param value does not depend on fields outside allFields
  //       ensure that param value does not introduce circular depndencies
  //       add param, param value to unresolved fields
  //     else:
  //       add directly to resolvedFields

  for (const param of params) {
    if (
      !resolvedFields.hasOwnProperty(param.param) &&
      !unresolvedFields.hasOwnProperty(param.param)
    ) {
      const paramValue = await promptParam(param);
      if (isCEL(paramValue)) {
        // TODO: we probably want to gin up a way to retry the prompt when either of these checks fail, since the most likely cause is a typo
        const deps = dependenciesCEL(paramValue);
        const allDepsFound = deps.every((dep) => {
          return allFields.includes(dep);
        });
        if (!allDepsFound) {
          throw new FirebaseError("CEL expression unresolvable; missing required parameters.");
        }
        if (hasCircularDeps(param.param, paramValue, unresolvedFields)) {
          throw new FirebaseError("CEL expression unresolvable; circular parameter dependencies.");
        }
        unresolvedFields[param.param] = paramValue;
      } else {
        resolvedFields[param.param] = paramValue;
      }
    }
  }

  // while unresolvedFields.length > 0:
  // loop through unresolvedFields and resolve any that depend only on values in resolvedfields
  //    make sure to remove them from unresolvedfields after
  let stuck = false;
  while (true) {
    const stillUnresolved: Record<string, CEL> = {};
    for (const k of Object.keys(unresolvedFields)) {
      const expr = unresolvedFields[k];
      const deps = dependenciesCEL(expr);
      const resolvable = deps.every((dep) => {
        return Object.keys(resolvedFields).includes(dep);
      });
      if (resolvable) {
        stuck = false;
        // uh-oh
        resolvedFields[k] = resolveString(expr, resolvedFields);
      } else {
        stillUnresolved[k] = expr;
      }
    }
    if (stuck) {
      throw new FirebaseError("Cycle detected during Functions parameter resolution");
    }
    if (Object.keys(stillUnresolved).length === 0) {
      break;
    }
    unresolvedFields = stillUnresolved;
    stuck = true;
  }

  return resolvedFields;
}

/**
 * Returns the resolved value of a user-defined Functions parameter.
 * Functions params are defined by the output of the Functions SDK, but their value is not set until deploy-time.
 *
 * For most param types, we check the contents of the dotenv files first for a matching key, then interactively prompt the user.
 * When the CLI is running in non-interactive mode or with the --force argument, it is an error for a param to be undefined in dotenvs.
 */
async function promptParam(param: Param): Promise<ParamValue> {
  const paramName = param.param;

  switch (param.type) {
    case "string":
      return promptStringParam(param);
    case "int":
      return promptIntParam(param);
    default:
      throw new FirebaseError("Build specified parameter " + param + " with unsupported type");
  }
}

async function promptStringParam(param: StringParam): Promise<string> {
  if (!param.input) {
    const defaultToText: TextInput<string> = { text: {} };
    param.input = defaultToText;
  }

  switch (param.input.type) {
    case "select":
      throw new FirebaseError(
        "Build specified string parameter " + param.param + " with unsupported input type 'select'"
      );
    case "text":
    default:
      let prompt = `Enter a value for ${param.label || param.param}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      return await promptOnce({
        name: param.param,
        type: "input",
        default: param.default,
        message: prompt,
      });
  }
}

async function promptIntParam(param: IntParam): Promise<number> {
  if (!param.input) {
    const defaultToText: TextInput<string> = { text: {} };
    param.input = defaultToText;
  }

  switch (param.input.type) {
    case "select":
      throw new FirebaseError(
        "Build specified int parameter " + param.param + " with unsupported input type 'select'"
      );
    case "text":
    default:
      let prompt = `Enter a value for ${param.label || param.param}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      let res: number;
      while (true) {
        res = await promptOnce({
          name: param.param,
          type: "number",
          default: param.default,
          message: prompt,
        });
        if (Number.isInteger(res)) {
          return res;
        }
        logger.error(`${param.label || param.param} must be an integer; retrying...`);
      }
  }
}
