import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { promptOnce } from "../../prompt";
import * as build from "./build";
import { assertExhaustive, partition } from "../../functional";

type CEL = build.Expression<string> | build.Expression<number> | build.Expression<boolean>;

function isCEL(expr: string | number | boolean): expr is CEL {
  return typeof expr === "string" && expr.includes("{{") && expr.includes("}}");
}

function dependenciesCEL(expr: CEL): string[] {
  const deps: string[] = [];
  const paramCapture = /{{ params\.(\w+) }}/g;
  let match: RegExpMatchArray | null;
  while ((match = paramCapture.exec(expr)) != null) {
    deps.push(match[1]);
  }
  return deps;
}

/**
 * Resolves a numeric field in a Build to an an actual numeric value.
 * Fields can be literal or a {{ }} delimited CEL expression referencing param values.
 * Currently only the CEL identity {{ params.PARAMNAME }} is implemented.
 */
export function resolveInt(
  from: number | build.Expression<number>,
  paramValues: Record<string, build.Field<string | number | boolean>>
): number {
  if (typeof from === "number") {
    return from;
  }
  const match = /{{ params\.(\w+) }}/.exec(from);
  if (!match) {
    throw new FirebaseError("CEL evaluation of expression '" + from + "' not yet supported");
  }
  const referencedParamValue = paramValues[match[1]];
  if (typeof referencedParamValue !== "number") {
    throw new FirebaseError(
      "Referenced numeric parameter '" +
        match +
        "' resolved to non-number value " +
        referencedParamValue
    );
  }
  return referencedParamValue;
}

/**
 * Resolves a string field in a Build to an an actual string.
 * Fields can be literal or a {{ }} delimited CEL expression referencing param values.
 * Currently only the CEL identity {{ params.PARAMNAME }} is implemented.
 */
export function resolveString(
  from: string | build.Expression<string>,
  paramValues: Record<string, build.Field<string | number | boolean>>
): string {
  if (!isCEL(from)) {
    return from;
  }
  let output = from;
  const paramCapture = /{{ params\.(\w+) }}/g;
  let match: RegExpMatchArray | null;
  while ((match = paramCapture.exec(from)) != null) {
    const referencedParamValue = paramValues[match[1]];
    if (typeof referencedParamValue !== "string") {
      throw new FirebaseError(
        "Referenced string parameter '" +
          match[1] +
          "' resolved to non-string value " +
          referencedParamValue
      );
    }
    output = output.replace(`{{ params.${match[1]} }}`, referencedParamValue);
  }
  if (isCEL(output)) {
    throw new FirebaseError(
      "CEL evaluation of non-identity expression '" + from + "' not yet supported"
    );
  }
  return output;
}

/**
 * Resolves a boolean field in a Build to an an actual boolean value.
 * Fields can be literal or a {{ }} delimited CEL expression referencing param values.
 * Currently only the CEL identity {{ params.PARAMNAME }} is implemented.
 */
export function resolveBoolean(
  from: boolean | build.Expression<boolean>,
  paramValues: Record<string, build.Field<string | number | boolean>>
): boolean {
  if (typeof from === "string" && /{{ params\.(\w+) }}/.test(from)) {
    const match = /{{ params\.(\w+) }}/.exec(from);
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
  name: string;

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
  type: "string";

  // If omitted, defaults to TextInput<string>
  input?: TextInput<string> | SelectInput<string>;
}

export interface IntParam extends ParamBase<number> {
  type: "int";

  // If omitted, defaults to TextInput<number>
  input?: TextInput<number> | SelectInput<number>;
}

export interface TextInput<T, Extensions = {}> { // eslint-disable-line
  type: "text";

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
  type: "select";

  select: Array<SelectOptions<T>>;
}

export type Param = StringParam | IntParam;
type ParamValue = string | number | boolean;

/**
 * Calls the corresponding resolveX function for the type of a param.
 * To be used when resolving the default value of a param, if CEL.
 * It's an error to call this on a CEL expression that depends on params not already known in the currentEnv.
 */
function resolveDefaultCEL(
  type: string,
  expr: CEL,
  currentEnv: Record<string, ParamValue>
): ParamValue {
  const deps = dependenciesCEL(expr);
  const allDepsFound = deps.every((dep) => !!currentEnv[dep]);
  if (!allDepsFound) {
    throw new FirebaseError(
      "Build specified parameter with un-resolvable default value " +
        expr +
        "; dependencies missing."
    );
  }

  switch (type) {
    case "string":
      return resolveString(expr, currentEnv);
    case "int":
      return resolveInt(expr, currentEnv);
    default:
      throw new FirebaseError(
        "Build specified parameter with default " + expr + " of unsupported type"
      );
  }
}
/**
 * Tests whether a mooted ParamValue literal is of the correct type to be the value for a Param.
 */
function canSatisfyParam(param: Param, value: ParamValue): boolean {
  if (param.type === "string") {
    return typeof value === "string";
  } else if (param.type === "int") {
    return typeof value === "number" && Number.isInteger(value);
  }
  assertExhaustive(param);
}

/**
 * A param defined by the SDK may resolve to:
 * - the value of a Cloud Secret in the same project with name == param name (not implemented yet), but only if it's a SecretParam
 * - a literal value of the same type already defined in one of the .env files with key == param name
 * - the value returned by interactively prompting the user
 *   - the default value of the prompt comes from the SDK via param.default, which may be a literal value or a CEL expression
 *   - if the default CEL expression is not resolvable--it depends on a param whose value is not yet known--we throw an error
 *   - yes, this means that the same set of params may or may not throw depending on the order the SDK provides them to us in
 *   - after prompting, the resolved value of the param is written to the most specific .env file available
 */
export async function resolveParams(
  params: Param[],
  projectId: string,
  userEnvs: Record<string, ParamValue>
): Promise<Record<string, ParamValue>> {
  const paramValues: Record<string, ParamValue> = {};

  const [provided, outstanding] = partition(params, (param) => {
    return {}.hasOwnProperty.call(userEnvs, param.name);
  });
  for (const param of provided) {
    if (!canSatisfyParam(param, userEnvs[param.name])) {
      throw new FirebaseError(
        "Parameter " +
          param.name +
          " resolved to value from dotenv files " +
          userEnvs[param.name] +
          " of wrong type"
      );
    }
    paramValues[param.name] = userEnvs[param.name];
  }

  for (const param of outstanding) {
    let paramDefault: ParamValue | undefined = param.default;
    if (paramDefault && isCEL(paramDefault)) {
      paramDefault = resolveDefaultCEL(param.type, paramDefault, paramValues);
    }
    if (paramDefault && !canSatisfyParam(param, paramDefault)) {
      throw new FirebaseError(
        "Parameter " + param.name + " has default value " + paramDefault + " of wrong type"
      );
    }
    paramValues[param.name] = await promptParam(param, paramDefault);
  }

  return paramValues;
}

/**
 * Returns the resolved value of a user-defined Functions parameter.
 * Functions params are defined by the output of the Functions SDK, but their value is not set until deploy-time.
 *
 * For most param types, we check the contents of the dotenv files first for a matching key, then interactively prompt the user.
 * When the CLI is running in non-interactive mode or with the --force argument, it is an error for a param to be undefined in dotenvs.
 */
async function promptParam(param: Param, resolvedDefault?: ParamValue): Promise<ParamValue> {
  if (param.type === "string") {
    return promptStringParam(param, resolvedDefault as string | undefined);
  } else if (param.type === "int") {
    return promptIntParam(param, resolvedDefault as number | undefined);
  }
  assertExhaustive(param);
}

async function promptStringParam(param: StringParam, resolvedDefault?: string): Promise<string> {
  if (!param.input) {
    const defaultToText: TextInput<string> = { type: "text", text: {} };
    param.input = defaultToText;
  }

  switch (param.input.type) {
    case "select":
      throw new FirebaseError(
        "Build specified string parameter " + param.name + " with unsupported input type 'select'"
      );
    case "text":
    default:
      let prompt = `Enter a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      return await promptOnce({
        name: param.name,
        type: "input",
        default: resolvedDefault,
        message: prompt,
      });
  }
}

async function promptIntParam(param: IntParam, resolvedDefault?: number): Promise<number> {
  if (!param.input) {
    const defaultToText: TextInput<number> = { type: "text", text: {} };
    param.input = defaultToText;
  }

  switch (param.input.type) {
    case "select":
      throw new FirebaseError(
        "Build specified int parameter " + param.name + " with unsupported input type 'select'"
      );
    case "text":
    default:
      let prompt = `Enter a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      let res: number;
      while (true) {
        res = await promptOnce({
          name: param.name,
          type: "number",
          default: resolvedDefault,
          message: prompt,
        });
        if (Number.isInteger(res)) {
          return res;
        }
        logger.error(`${param.label || param.name} must be an integer; retrying...`);
      }
  }
}
