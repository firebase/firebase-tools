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
    if (!match) {
      return 0;
    }
    const referencedParamValue = paramValues[match[1]];
    if (typeof referencedParamValue !== "number") {
      throw new FirebaseError(
        "Referenced string parameter '" +
          match +
          "' resolved to non-string value " +
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
 * Resolves a numeric string in a Build to an an actual string.
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
    if (!match) {
      return "";
    }
    const referencedParamValue = paramValues[match[1]];
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
    if (!match) {
      return false;
    }
    const referencedParamValue = paramValues[match[1]];
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

/**
 * Returns the resolved value of a user-defined Functions parameter.
 * Functions params are defined by the output of the Functions SDK, but their value is not set until deploy-time.
 *
 * For most param types, we check the contents of the dotenv files first for a matching key, then interactively prompt the user.
 * When the CLI is running in non-interactive mode or with the --force argument, it is an error for a param to be undefined in dotenvs.
 */
export async function handleParam(
  param: Param,
  projectId: string,
  userEnvs: Record<string, string>
): Promise<string | number | boolean> {
  const paramName = param.param;

  if (userEnvs.hasOwnProperty(paramName)) {
    return userEnvs[paramName];
  }

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
    if (param.default) {
      return resolveString(param.default, {});
    }
    throw new FirebaseError(
      "Build specified string parameter " + param.param + " without any input form or default value"
    );
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
    if (param.default) {
      return resolveInt(param.default, {});
    }
    throw new FirebaseError(
      "Build specified string parameter " + param.param + " without any input form or default value"
    );
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
      const res = await promptOnce({
        name: param.param,
        type: "number",
        default: param.default,
        message: prompt,
      });
      if (!Number.isInteger(res)) {
        // / TODO: what do we do here? is there a way to force prompts to only give us integers?
      }
      return res;
  }
}
