import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { promptOnce } from "../../prompt";
import * as build from "./build";
import { assertExhaustive, partition } from "../../functional";
import { UserEnvsOpts } from "../../functions/env";
import * as secretManager from "../../gcp/secretManager";

interface ListItem {
  name?: string; // User friendly display name for the option
  value: string; // Value of the option
  checked: boolean; // Whether the option should be checked by default
}

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

export interface BooleanParam extends ParamBase<number> {
  type: "boolean";

  // If omitted, defaults to TextInput<number>
  input?: TextInput<boolean> | SelectInput<boolean>;
}

export interface TextInput<T> { // eslint-disable-line
  type: "text";

  example?: string;
}

export interface StringTextInput extends TextInput<string> {
  validationRegex?: string;

  validationErrorMessage?: string
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

// Future supported resource types will be added to this literal type. Tooling SHOULD fall back
// to text entry if it encounters an unknown ResourceParamType
type ResourceType = "storage.googleapis.com/Bucket"

interface ResourceInput {
  resource: {
    type: ResourceType;
  };
}

interface SecretParam {
  type: "secret";

  // name of the param. Will be exposed as an environment variable with this name
  name: string;

  // A human friendly name for the param. Will be used in install/configure flows to describe
  // what param is being updated. If omitted, UX will use the value of "param" instead.
  label?: string;

  // A long description of the parameter's purpose and allowed values. If omitted, UX will not
  // provide a description of the parameter
  description?: string;

  as?: "string" | "int" | "boolean"
}


export type Param = StringParam | IntParam | BooleanParam | SecretParam;
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
  } else if (param.type === "boolean") {
    return typeof value === "boolean";
  } else if (param.type === "secret") {
    return false;
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
  userEnvs: Record<string, ParamValue>,
  userEnvOpts: UserEnvsOpts
): Promise<Record<string, ParamValue>> {
  const paramValues: Record<string, ParamValue> = {};

  const [resolved, outstanding] = partition(params, (param) => {
    return {}.hasOwnProperty.call(userEnvs, param.name);
  });
  for (const param of resolved) {
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

  const [needSecret, needPrompt] = partition(outstanding, (param) => {
    return param.type == "secret";
  });
  for (const param of needSecret) {
    const secretParam = param as SecretParam;
    const rawValue = await handleSecret(secretParam, projectId);
    let value: ParamValue;
    switch (secretParam.as) {
      case "boolean":
        if (rawValue === "true") {
          value = true;
        } else if (rawValue === "false") {
          value = false;
        } else {
          throw new FirebaseError(`Secret parameter ${secretParam.name} should have been interpreted as ${secretParam.as} but had an illegal value in Cloud Secret Manager; must be 'true' or 'false'`);
        }
        break;
      case "int":
        value = +rawValue;
        break;
      case "string":
      default:
        value = rawValue;
        break;
    }
    paramValues[secretParam.name] = value;
  }
  for (const param of needPrompt) {
    const promptable = param as Exclude<Param, SecretParam>;
    let paramDefault: ParamValue | undefined = promptable.default;
    if (paramDefault && isCEL(paramDefault)) {
      paramDefault = resolveDefaultCEL(param.type, paramDefault, paramValues);
    }
    if (paramDefault && !canSatisfyParam(param, paramDefault)) {
      throw new FirebaseError(
        "Parameter " + param.name + " has default value " + paramDefault + " of wrong type"
      );
    }
    paramValues[param.name] = await promptParam(param, paramDefault);

    // TODO(vsfan@): Once we have writeUserEnvs in functions/env.ts implemented, call it to persist user-provided params
  }

  return paramValues;
}

/**
 * Handles a SecretParam, either by retrieving its latest value from Cloud Secret Manager if present,
 * or prompting the user for the value of a new secret.
 * Always returns a string, since secret values are stored as untyped bytes in CSM.
 */
async function handleSecret(secretParam: SecretParam, projectId: string): Promise<string> {
  const metadata = await getSecretMetadata(projectId, secretParam.name, "latest");
  if (!metadata.secret) {
    const secretValue = await promptOnce({
      name: secretParam.name,
      type: "password",
      message: `This secret will be stored in Cloud Secret Manager (https://cloud.google.com/secret-manager/pricing) as ${name} and managed by Firebase Hosting (Firebase Hosting Service Agent will be granted Secret Admin role on this secret).\nEnter a value for ${secretParam.label || secretParam.name}:`,
    });
    await secretManager.createSecret(projectId, secretParam.name, {});
    await secretManager.addVersion(projectId, secretParam.name, secretValue);
    return secretValue;
  } else if (!metadata.secretVersion) {
    // the secret exists, but version "latest" doesnt, which...is questionably possible?
  }

  // we need to test if the hosting service account can actually read
  secretManager.ensureServiceAgentRole(metadata.secret, [`WTF.iam.gserviceaccount.com`], "roles/secretmanager.admin");

  return secretManager.accessSecretVersion(projectId, secretParam.name, "latest");
}

async function getSecretMetadata(
  projectId: string,
  secretName: string,
  version: string
): Promise<{
  secret?: secretManager.Secret;
  secretVersion?: secretManager.SecretVersion;
}> {
  const secretInfo: any = {};
  try {
    secretInfo.secret = await secretManager.getSecret(projectId, secretName);
    secretInfo.secretVersion = await secretManager.getSecretVersion(projectId, secretName, version);
  } catch (err: any) {
    // Throw anything other than the expected 404 errors.
    if (err.status !== 404) {
      throw err;
    }
  }
  return secretInfo;
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
  } else if (param.type === "boolean") {
    return promptBooleanParam(param, resolvedDefault as boolean | undefined);
  } else if (param.type === "secret") {
    throw new FirebaseError(`Somehow ended up trying to interactively prompt for secret parameter ${param.name}, which should never happen.`);
  }
  assertExhaustive(param);
}

async function promptBooleanParam(param: BooleanParam, resolvedDefault?: boolean): Promise<boolean> {
  if (!param.input) {
    const defaultToText: TextInput<boolean> = { type: "text" };
    param.input = defaultToText;
  }

  let prompt: string;
  let response: boolean;

  switch (param.input.type) {
    case "select":
      prompt = `Select a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      response = await promptOnce({
        name: "input",
        type: "list",
        default: () => {
          if (resolvedDefault === true || resolvedDefault === false) {
            return resolvedDefault;
          }
        },
        message:
          "Which option do you want enabled for this parameter? " +
          "Select an option with the arrow keys, and use Enter to confirm your choice. " +
          "You may only select one option.",
        choices: param.input.select.map((option: SelectOptions<boolean>): ListItem => {
          return {
            checked: false,
            name: option.label,
            value: option.value.toString(),
          };
        })
      });
      return response;
    case "text":
    default:
      prompt = `Enter a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      const res = await promptOnce({
        name: param.name,
        type: "input",
        default: resolvedDefault?.toString(),
        message: prompt,
      });
      return ['true', 'y', 'yes', '1'].includes(res.toLowerCase());
  }
}

async function promptStringParam(param: StringParam, resolvedDefault?: string): Promise<string> {
  if (!param.input) {
    const defaultToText: TextInput<string> = { type: "text"};
    param.input = defaultToText;
  }
  let prompt: string;
  let response: string;

  switch (param.input.type) {
    case "select":
      prompt = `Select a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      response = await promptOnce({
        name: "input",
        type: "list",
        default: () => {
          if (resolvedDefault) {
            return resolvedDefault;
          }
        },
        message:
          "Which option do you want enabled for this parameter? " +
          "Select an option with the arrow keys, and use Enter to confirm your choice. " +
          "You may only select one option.",
        choices: param.input.select.map((option: SelectOptions<string>): ListItem => {
          return {
            checked: false,
            name: option.label,
            value: option.value,
          };
        })
      });
      return response;
    case "text":
    default:
      prompt = `Enter a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      let res: string;
      while(true) {
        res = await promptOnce({
          name: param.name,
          type: "input",
          default: resolvedDefault,
          message: prompt,
        });
        if ("validationRegex" in param.input) {

        }
      }
  }
}

async function promptIntParam(param: IntParam, resolvedDefault?: number): Promise<number> {
  if (!param.input) {
    const defaultToText: TextInput<number> = { type: "text" };
    param.input = defaultToText;
  }
  let prompt: string;
  let response: number;

  switch (param.input.type) {
    case "select":
      prompt = `Select a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      response = await promptOnce({
        name: "input",
        type: "list",
        default: () => {
          if (resolvedDefault) {
            return resolvedDefault;
          }
        },
        message:
          "Which option do you want enabled for this parameter? " +
          "Select an option with the arrow keys, and use Enter to confirm your choice. " +
          "You may only select one option.",
        choices: param.input.select.map((option: SelectOptions<number>): ListItem => {
          return {
            checked: false,
            name: option.label,
            value: option.value.toString(),
          };
        })
      });
      return +response;
    case "text":
    default:
      prompt = `Enter a value for ${param.label || param.name}:`;
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
