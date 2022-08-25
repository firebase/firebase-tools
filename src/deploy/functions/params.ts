import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { promptOnce } from "../../prompt";
import * as build from "./build";
import { assertExhaustive, partition } from "../../functional";
import * as secretManager from "../../gcp/secretManager";
import { listBuckets } from "../../gcp/storage";

// A convinience type containing options for Prompt's select
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
  paramValues: Record<string, ParamValue>
): number {
  if (typeof from === "number") {
    return from;
  }
  const match = /{{ params\.(\w+) }}/.exec(from);
  if (!match) {
    throw new FirebaseError("CEL evaluation of expression '" + from + "' not yet supported");
  }
  const referencedParamValue = paramValues[match[1]];
  if (!referencedParamValue.legalNumber) {
    throw new FirebaseError(
      "Referenced numeric parameter '" +
        match +
        "' resolved to non-number value " +
        referencedParamValue
    );
  }
  return referencedParamValue.asNumber();
}

/**
 * Resolves a string field in a Build to an an actual string.
 * Fields can be literal or a {{ }} delimited CEL expression referencing param values.
 * Currently only the CEL identity {{ params.PARAMNAME }} is implemented.
 */
export function resolveString(
  from: string | build.Expression<string>,
  paramValues: Record<string, ParamValue>
): string {
  if (!isCEL(from)) {
    return from;
  }
  let output = from;
  const paramCapture = /{{ params\.(\w+) }}/g;
  let match: RegExpMatchArray | null;
  while ((match = paramCapture.exec(from)) != null) {
    const referencedParamValue = paramValues[match[1]];
    if (!referencedParamValue.legalString) {
      throw new FirebaseError(
        "Referenced string parameter '" +
          match[1] +
          "' resolved to non-string value " +
          referencedParamValue
      );
    }
    output = output.replace(`{{ params.${match[1]} }}`, referencedParamValue.asString());
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
  paramValues: Record<string, ParamValue>
): boolean {
  if (typeof from === "string" && /{{ params\.(\w+) }}/.test(from)) {
    const match = /{{ params\.(\w+) }}/.exec(from);
    const referencedParamValue = paramValues[match![1]];
    if (!referencedParamValue.legalBoolean) {
      throw new FirebaseError(
        "Referenced boolean parameter '" +
          match +
          "' resolved to non-boolean value " +
          referencedParamValue
      );
    }
    return referencedParamValue.asBoolean();
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
  input?: TextInput<string> | SelectInput<string> | ResourceInput;
}

export interface IntParam extends ParamBase<number> {
  type: "int";

  // If omitted, defaults to TextInput<number>
  input?: TextInput<number> | SelectInput<number>;
}

export interface BooleanParam extends ParamBase<number> {
  type: "boolean";

  // If omitted, defaults to TextInput<boolean>
  input?: TextInput<boolean> | SelectInput<boolean>;
}

export interface TextInput<T> { // eslint-disable-line
  type: "text";

  example?: string;

  // If present, retry the prompt if the user provides a string that does not match this regexp
  validationRegex?: string;
  // The error message to display if validationRegex is missing
  validationErrorMessage?: string;
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
type ResourceType = "storage.googleapis.com/Bucket" | string;

interface ResourceInput {
  type: "resource";

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
}

export type Param = StringParam | IntParam | BooleanParam | SecretParam;
type RawParamValue = string | number | boolean;

/**
 * A type which contains the resolved value of a param, and metadata ensuring
 * that it's used in the correct way:
 * - ParamValues coming from a dotenv file will have all three legal type fields set.
 * - ParamValues coming from prompting a param will have type fields corresponding to
 *   the type of the Param.
 * - ParamValues coming from Cloud Secrets Manager will have a string type field set
 *   and isSecret = true, telling the Build process not to write the value to .env files.
 */
export class ParamValue {
  // Whether this param value can be sensibly interpreted as a string
  legalString: boolean;
  // Whether this param value can be sensibly interpreted as a boolean
  legalBoolean: boolean;
  // Whether this param value can be sensibly interpreted as a number
  legalNumber: boolean;

  constructor(
    private readonly rawValue: string,
    readonly secret: boolean,
    types: { string?: boolean; boolean?: boolean; number?: boolean }
  ) {
    this.rawValue = rawValue;
    this.secret = secret;
    this.legalString = types.string || false;
    this.legalBoolean = types.boolean || false;
    this.legalNumber = types.number || false;
  }

  toString(): string {
    return this.rawValue;
  }

  asString(): string {
    return this.rawValue;
  }

  asBoolean(): boolean {
    return ["true", "y", "yes", "1"].includes(this.rawValue);
  }

  asNumber(): number {
    return +this.rawValue;
  }
}

/**
 * Calls the corresponding resolveX function for the type of a param.
 * To be used when resolving the default value of a param, if CEL.
 * It's an error to call this on a CEL expression that depends on params not already known in the currentEnv.
 */
function resolveDefaultCEL(
  type: string,
  expr: CEL,
  currentEnv: Record<string, ParamValue>
): RawParamValue {
  const deps = dependenciesCEL(expr);
  const allDepsFound = deps.every((dep) => !!currentEnv[dep]);
  const dependsOnSecret = deps.some((dep) => currentEnv[dep].secret);
  if (!allDepsFound || dependsOnSecret) {
    throw new FirebaseError(
      "Build specified parameter with un-resolvable default value " +
        expr +
        "; dependencies missing."
    );
  }

  switch (type) {
    case "boolean":
      return resolveBoolean(expr, currentEnv);
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
function canSatisfyParam(param: Param, value: RawParamValue): boolean {
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
 *   - it is an error to have params that need to be prompted if the CLI is running in non-interactive mode
 *   - the default value of the prompt comes from the SDK via param.default, which may be a literal value or a CEL expression
 *   - if the default CEL expression is not resolvable--it depends on a param whose value is not yet known--we throw an error
 *   - yes, this means that the same set of params may or may not throw depending on the order the SDK provides them to us in
 *   - after prompting, the resolved value of the param is written to the most specific .env file available
 */
export async function resolveParams(
  params: Param[],
  projectId: string,
  userEnvs: Record<string, ParamValue>,
  nonInteractive?: boolean
): Promise<Record<string, ParamValue>> {
  const paramValues: Record<string, ParamValue> = {};

  // TODO(vsfan@): should we ever reject param values from .env files based on the appearance of the string?
  const [resolved, outstanding] = partition(params, (param) => {
    return {}.hasOwnProperty.call(userEnvs, param.name);
  });
  for (const param of resolved) {
    paramValues[param.name] = userEnvs[param.name];
  }

  const [needSecret, needPrompt] = partition(outstanding, (param) => param.type === "secret");
  for (const param of needSecret) {
    const secretParam = param as SecretParam;
    const rawValue = await handleSecret(secretParam, projectId);
    const value = new ParamValue(rawValue, true, { string: true });
    paramValues[secretParam.name] = value;
  }

  if (nonInteractive && needPrompt.length > 0) {
    const envNames = outstanding.map((p) => p.name).join(", ");
    throw new FirebaseError(
      `In non-interactive mode but have no value for the following environment variables: ${envNames}\n` +
        "To continue, either run `firebase deploy` with an interactive terminal, or add values to a dotenv file. " +
        "For information regarding how to use dotenv files, see https://firebase.google.com/docs/functions/config-env"
    );
  }
  for (const param of needPrompt) {
    const promptable = param as Exclude<Param, SecretParam>;
    let paramDefault: RawParamValue | undefined = promptable.default;
    if (paramDefault && isCEL(paramDefault)) {
      paramDefault = resolveDefaultCEL(param.type, paramDefault, paramValues);
    }
    if (paramDefault && !canSatisfyParam(param, paramDefault)) {
      throw new FirebaseError(
        "Parameter " + param.name + " has default value " + paramDefault + " of wrong type"
      );
    }
    paramValues[param.name] = await promptParam(param, projectId, paramDefault);
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
      message: `This secret will be stored in Cloud Secret Manager (https://cloud.google.com/secret-manager/pricing) as ${
        secretParam.name
      } and managed by Firebase Hosting (Firebase Hosting Service Agent will be granted Secret Admin role on this secret).\nEnter a value for ${
        secretParam.label || secretParam.name
      }:`,
    });
    const secretLabel: Record<string, string> = { "firebase-hosting-managed": "yes" };
    await secretManager.createSecret(projectId, secretParam.name, secretLabel);
    await secretManager.addVersion(projectId, secretParam.name, secretValue);
    return secretValue;
  } else if (!metadata.secretVersion) {
    throw new FirebaseError(
      `Cloud Secret Manager has no latest version of the secret defined by param ${
        secretParam.label || secretParam.name
      }`
    );
  }
  if (metadata.secretVersion.state === "DESTROYED" || metadata.secretVersion.state === "DISABLED") {
    throw new FirebaseError(
      `Cloud Secret Manager's latest version of secret '${
        secretParam.label || secretParam.name
      } is in illegal state ${metadata.secretVersion.state}`
    );
  }

  secretManager.ensureServiceAgentRole(
    metadata.secret,
    [`${projectId}@appspot.gserviceaccount.com`],
    "roles/secretmanager.admin"
  );
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
async function promptParam(
  param: Param,
  projectId: string,
  resolvedDefault?: RawParamValue
): Promise<ParamValue> {
  if (param.type === "string") {
    const provided = await promptStringParam(
      param,
      projectId,
      resolvedDefault as string | undefined
    );
    return new ParamValue(provided.toString(), false, { string: true });
  } else if (param.type === "int") {
    const provided = await promptIntParam(param, resolvedDefault as number | undefined);
    return new ParamValue(provided.toString(), false, { number: true });
  } else if (param.type === "boolean") {
    const provided = await promptBooleanParam(param, resolvedDefault as boolean | undefined);
    return new ParamValue(provided.toString(), false, { boolean: true });
  } else if (param.type === "secret") {
    throw new FirebaseError(
      `Somehow ended up trying to interactively prompt for secret parameter ${param.name}, which should never happen.`
    );
  }
  assertExhaustive(param);
}

async function promptBooleanParam(
  param: BooleanParam,
  resolvedDefault?: boolean
): Promise<boolean> {
  if (!param.input) {
    const defaultToText: TextInput<boolean> = { type: "text" };
    param.input = defaultToText;
  }
  const isTruthyInput = (res: string) => ["true", "y", "yes", "1"].includes(res.toLowerCase());
  let prompt: string;

  switch (param.input.type) {
    case "select":
      prompt = `Select a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
      return promptSelect<boolean>(prompt, param.input, resolvedDefault, isTruthyInput);
    case "text":
    default:
      prompt = `Enter a boolean value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      return promptText<boolean>(prompt, param.input, resolvedDefault, isTruthyInput);
  }
}

async function promptStringParam(
  param: StringParam,
  projectId: string,
  resolvedDefault?: string
): Promise<string> {
  if (!param.input) {
    const defaultToText: TextInput<string> = { type: "text" };
    param.input = defaultToText;
  }
  let prompt: string;

  switch (param.input.type) {
    case "resource":
      prompt = `Select a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      return promptResourceString(prompt, param.input, projectId, resolvedDefault);
    case "select":
      prompt = `Select a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
      return promptSelect<string>(prompt, param.input, resolvedDefault, (res: string) => res);
    case "text":
    default:
      prompt = `Enter a string value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      return promptText<string>(prompt, param.input, resolvedDefault, (res: string) => res);
  }
}

async function promptIntParam(param: IntParam, resolvedDefault?: number): Promise<number> {
  if (!param.input) {
    const defaultToText: TextInput<number> = { type: "text" };
    param.input = defaultToText;
  }
  let prompt: string;

  switch (param.input.type) {
    case "select":
      prompt = `Select a value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
      return promptSelect(prompt, param.input, resolvedDefault, (res: string) => {
        if (isNaN(+res)) {
          return { message: `"${res}" could not be converted to a number.` };
        }
        if (res.includes(".")) {
          return { message: `${res} is not an integer value.` };
        }
        return +res;
      });
    case "text":
    default:
      prompt = `Enter an integer value for ${param.label || param.name}:`;
      if (param.description) {
        prompt += ` \n(${param.description})`;
      }
      return promptText<number>(prompt, param.input, resolvedDefault, (res: string) => {
        if (isNaN(+res)) {
          return { message: `"${res}" could not be converted to a number.` };
        }
        if (res.includes(".")) {
          return { message: `${res} is not an integer value.` };
        }
        return +res;
      });
  }
}

async function promptResourceString(
  prompt: string,
  input: ResourceInput,
  projectId: string,
  resolvedDefault?: string
): Promise<string> {
  const notFound = new FirebaseError(`No instances of ${input.resource.type} found.`);
  switch (input.resource.type) {
    case "storage.googleapis.com/Bucket":
      const buckets = await listBuckets(projectId);
      if (buckets.length === 0) {
        throw notFound;
      }
      const forgedInput: SelectInput<string> = {
        type: "select",
        select: buckets.map((bucketName: string): SelectOptions<string> => {
          return { label: bucketName, value: bucketName };
        }),
      };
      return promptSelect<string>(prompt, forgedInput, resolvedDefault, (res: string) => res);
    default:
      logger.warn(
        `Warning: unknown resource type ${input.resource.type}; defaulting to raw text input...`
      );
      return promptText<string>(prompt, { type: "text" }, resolvedDefault, (res: string) => res);
  }
}

type retryInput = { message: string };
async function promptText<T extends RawParamValue>(
  prompt: string,
  input: TextInput<T>,
  resolvedDefault: T | undefined,
  converter: (res: string) => T | retryInput
): Promise<T> {
  const res = await promptOnce({
    type: "input",
    default: resolvedDefault,
    message: prompt,
  });
  if (input.validationRegex) {
    const userRe = new RegExp(input.validationRegex);
    if (!userRe.test(res)) {
      logger.error(
        input.validationErrorMessage ||
          `Input did not match provided validator ${userRe.toString()}, retrying...`
      );
      return promptText<T>(prompt, input, resolvedDefault, converter);
    }
  }
  const converted = converter(res);
  if (typeof converted === "object") {
    logger.error(converted.message);
    return promptText<T>(prompt, input, resolvedDefault, converter);
  }
  return converted;
}

async function promptSelect<T extends RawParamValue>(
  prompt: string,
  input: SelectInput<T>,
  resolvedDefault: T | undefined,
  converter: (res: string) => T | retryInput
): Promise<T> {
  const response = await promptOnce({
    name: "input",
    type: "list",
    default: () => {
      resolvedDefault;
    },
    message: prompt,
    choices: input.select.map((option: SelectOptions<T>): ListItem => {
      return {
        checked: false,
        name: option.label,
        value: option.value.toString(),
      };
    }),
  });
  const converted = converter(response);
  if (typeof converted === "object") {
    logger.error(converted.message);
    return promptSelect<T>(prompt, input, resolvedDefault, converter);
  }
  return converted;
}
