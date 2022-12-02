import { logger } from "../../logger";
import { FirebaseError } from "../../error";
import { promptOnce } from "../../prompt";
import * as build from "./build";
import { assertExhaustive, partition } from "../../functional";
import * as secretManager from "../../gcp/secretManager";
import { listBuckets } from "../../gcp/storage";
import { isCelExpression, resolveExpression } from "./cel";
import { FirebaseConfig } from "./args";

// A convinience type containing options for Prompt's select
interface ListItem {
  name?: string; // User friendly display name for the option
  value: string; // Value of the option
  checked: boolean; // Whether the option should be checked by default
}

type CEL = build.Expression<string> | build.Expression<number> | build.Expression<boolean>;

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
 * Fields can be literal or an expression written in a subset of the CEL specification.
 * We support the identity CEL {{ params.FOO }} and equality/ternary operators like
 * {{ params.FOO == "asdf"}} or {{ params.FOO == 24 ? params.BAR : 0 }}
 */
export function resolveInt(
  from: number | build.Expression<number>,
  paramValues: Record<string, ParamValue>
): number {
  if (typeof from === "number") {
    return from;
  }
  return resolveExpression("number", from, paramValues) as number;
}

/**
 * Resolves a string field in a Build to an an actual string.
 * Fields can be literal or an expression written in a subset of the CEL specification.
 * We support the identity CEL {{ params.FOO }} and ternary operators {{ params.FOO == 24 ? params.BAR : 0 }}.
 * You can also use string-typed CEl expressions as part of an interpolation, region: "us-central-{{ params.ZONE }}"
 */
export function resolveString(
  from: string | build.Expression<string>,
  paramValues: Record<string, ParamValue>
): string {
  let output = from;
  const celCapture = /{{ .+? }}/g;
  const subExprs = from.match(celCapture);
  if (!subExprs || subExprs.length === 0) {
    return output;
  }
  for (const expr of subExprs) {
    const resolved = resolveExpression("string", expr, paramValues) as string;
    output = output.replace(expr, resolved);
  }
  return output;
}

/**
 * Resolves a boolean field in a Build to an an actual boolean value.
 * Fields can be literal or an expression written in a subset of the CEL specification.
 * We support the identity CEL {{ params.FOO }} and ternary operators {{ params.FOO == 24 ? params.BAR : true }}
 */
export function resolveBoolean(
  from: boolean | build.Expression<boolean>,
  paramValues: Record<string, ParamValue>
): boolean {
  if (typeof from === "boolean") {
    return from;
  }
  return resolveExpression("boolean", from, paramValues) as boolean;
}

type ParamInput<T> = TextInput<T> | SelectInput<T> | ResourceInput;

type ParamBase<T extends string | number | boolean> = {
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

  // Defines how the CLI will prompt for the value of the param if it's not in .env files
  input?: ParamInput<T>;
};

/**
 * Determines whether an Input field value can be coerced to TextInput.
 */
export function isTextInput<T>(input: ParamInput<T>): input is TextInput<T> {
  return {}.hasOwnProperty.call(input, "text");
}
/**
 * Determines whether an Input field value can be coerced to SelectInput.
 */
export function isSelectInput<T>(input: ParamInput<T>): input is SelectInput<T> {
  return {}.hasOwnProperty.call(input, "select");
}
/**
 * Determines whether an Input field value can be coerced to ResourceInput.
 */
export function isResourceInput<T>(input: ParamInput<T>): input is ResourceInput {
  return {}.hasOwnProperty.call(input, "resource");
}

export interface StringParam extends ParamBase<string> {
  type: "string";
}

export interface IntParam extends ParamBase<number> {
  type: "int";
}

export interface BooleanParam extends ParamBase<boolean> {
  type: "boolean";
}

export interface TextInput<T> { // eslint-disable-line
  text: {
    example?: string;

    // If present, retry the prompt if the user provides a string that does not match this regexp
    validationRegex?: string;
    // The error message to display if validationRegex is missing
    validationErrorMessage?: string;
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
  select: {
    options: Array<SelectOptions<T>>;
  };
}

// Future supported resource types will be added to this literal type. Tooling SHOULD fall back
// to text entry if it encounters an unknown ResourceParamType
type ResourceType = "storage.googleapis.com/Bucket" | string;

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
    readonly internal: boolean,
    types: { string?: boolean; boolean?: boolean; number?: boolean }
  ) {
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
  if (!allDepsFound) {
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
 * - a reference to a secret in Cloud Secret Manager, which we validate the existence of and prompt for if missing
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
  firebaseConfig: FirebaseConfig,
  userEnvs: Record<string, ParamValue>,
  nonInteractive?: boolean
): Promise<Record<string, ParamValue>> {
  const paramValues: Record<string, ParamValue> = populateDefaultParams(firebaseConfig);

  // TODO(vsfan@): should we ever reject param values from .env files based on the appearance of the string?
  const [resolved, outstanding] = partition(params, (param) => {
    return {}.hasOwnProperty.call(userEnvs, param.name);
  });
  for (const param of resolved) {
    paramValues[param.name] = userEnvs[param.name];
  }

  const [needSecret, needPrompt] = partition(outstanding, (param) => param.type === "secret");
  for (const param of needSecret) {
    await handleSecret(param as SecretParam, firebaseConfig.projectId);
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
    if (paramDefault && isCelExpression(paramDefault)) {
      paramDefault = resolveDefaultCEL(param.type, paramDefault, paramValues);
    }
    if (paramDefault && !canSatisfyParam(param, paramDefault)) {
      throw new FirebaseError(
        "Parameter " + param.name + " has default value " + paramDefault + " of wrong type"
      );
    }
    paramValues[param.name] = await promptParam(param, firebaseConfig.projectId, paramDefault);
  }

  return paramValues;
}

function populateDefaultParams(config: FirebaseConfig): Record<string, ParamValue> {
  const defaultParams: Record<string, ParamValue> = {};
  if (config.databaseURL !== "") {
    defaultParams["DATABASE_URL"] = new ParamValue(config.databaseURL, true, {
      string: true,
      boolean: false,
      number: false,
    });
  }
  defaultParams["PROJECT_ID"] = new ParamValue(config.projectId, true, {
    string: true,
    boolean: false,
    number: false,
  });
  defaultParams["GCLOUD_PROJECT"] = new ParamValue(config.projectId, true, {
    string: true,
    boolean: false,
    number: false,
  });
  if (config.storageBucket !== "") {
    defaultParams["STORAGE_BUCKET"] = new ParamValue(config.storageBucket, true, {
      string: true,
      boolean: false,
      number: false,
    });
  }
  return defaultParams;
}

/**
 * Handles a SecretParam by checking for the presence of a corresponding secret
 * in Cloud Secrets Manager. If not present, we currently ask the user to
 * create a corresponding one using functions:secret:set.
 * Firebase-tools is not responsible for providing secret values to the Functions
 * runtime environment, since having viewer permissions on a function is enough
 * to read its environment variables. They are instead provided through GCF's own
 * Secret Manager integration.
 */
async function handleSecret(secretParam: SecretParam, projectId: string) {
  const metadata = await secretManager.getSecretMetadata(projectId, secretParam.name, "latest");
  if (!metadata.secret) {
    const secretValue = await promptOnce({
      name: secretParam.name,
      type: "password",
      message: `This secret will be stored in Cloud Secret Manager (https://cloud.google.com/secret-manager/pricing) as ${
        secretParam.name
      }. Enter a value for ${secretParam.label || secretParam.name}:`,
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
  } else if (
    metadata.secretVersion.state === "DESTROYED" ||
    metadata.secretVersion.state === "DISABLED"
  ) {
    throw new FirebaseError(
      `Cloud Secret Manager's latest version of secret '${
        secretParam.label || secretParam.name
      } is in illegal state ${metadata.secretVersion.state}`
    );
  }
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
    const defaultToText: TextInput<string> = { text: {} };
    param.input = defaultToText;
  }
  const isTruthyInput = (res: string) => ["true", "y", "yes", "1"].includes(res.toLowerCase());
  let prompt: string;

  if (isSelectInput(param.input)) {
    prompt = `Select a value for ${param.label || param.name}:`;
    if (param.description) {
      prompt += ` \n(${param.description})`;
    }
    prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
    return promptSelect<boolean>(prompt, param.input, resolvedDefault, isTruthyInput);
  } else if (isTextInput(param.input)) {
    prompt = `Enter a boolean value for ${param.label || param.name}:`;
    if (param.description) {
      prompt += ` \n(${param.description})`;
    }
    return promptText<boolean>(prompt, param.input, resolvedDefault, isTruthyInput);
  } else if (isResourceInput(param.input)) {
    throw new FirebaseError("Boolean params cannot have Cloud Resource selector inputs");
  } else {
    assertExhaustive(param.input);
  }
}

async function promptStringParam(
  param: StringParam,
  projectId: string,
  resolvedDefault?: string
): Promise<string> {
  if (!param.input) {
    const defaultToText: TextInput<string> = { text: {} };
    param.input = defaultToText;
  }
  let prompt: string;

  if (isResourceInput(param.input)) {
    prompt = `Select a value for ${param.label || param.name}:`;
    if (param.description) {
      prompt += ` \n(${param.description})`;
    }
    return promptResourceString(prompt, param.input, projectId, resolvedDefault);
  } else if (isSelectInput(param.input)) {
    prompt = `Select a value for ${param.label || param.name}:`;
    if (param.description) {
      prompt += ` \n(${param.description})`;
    }
    prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
    return promptSelect<string>(prompt, param.input, resolvedDefault, (res: string) => res);
  } else if (isTextInput(param.input)) {
    prompt = `Enter a string value for ${param.label || param.name}:`;
    if (param.description) {
      prompt += ` \n(${param.description})`;
    }
    return promptText<string>(prompt, param.input, resolvedDefault, (res: string) => res);
  } else {
    assertExhaustive(param.input);
  }
}

async function promptIntParam(param: IntParam, resolvedDefault?: number): Promise<number> {
  if (!param.input) {
    const defaultToText: TextInput<number> = { text: {} };
    param.input = defaultToText;
  }
  let prompt: string;

  if (isSelectInput(param.input)) {
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
  }
  if (isTextInput(param.input)) {
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
  } else if (isResourceInput(param.input)) {
    throw new FirebaseError("Numeric params cannot have Cloud Resource selector inputs");
  } else {
    assertExhaustive(param.input);
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
        select: {
          options: buckets.map((bucketName: string): SelectOptions<string> => {
            return { label: bucketName, value: bucketName };
          }),
        },
      };
      return promptSelect<string>(prompt, forgedInput, resolvedDefault, (res: string) => res);
    default:
      logger.warn(
        `Warning: unknown resource type ${input.resource.type}; defaulting to raw text input...`
      );
      return promptText<string>(prompt, { text: {} }, resolvedDefault, (res: string) => res);
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
  if (input.text.validationRegex) {
    const userRe = new RegExp(input.text.validationRegex);
    if (!userRe.test(res)) {
      logger.error(
        input.text.validationErrorMessage ||
          `Input did not match provided validator ${userRe.toString()}, retrying...`
      );
      return promptText<T>(prompt, input, resolvedDefault, converter);
    }
  }
  // TODO(vsfan): the toString() is because PromptOnce()'s return type of string
  // is wrong--it will return the type of the default if selected. Remove this
  // hack once we fix the prompt.ts metaprogramming.
  const converted = converter(res.toString());
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
    default: resolvedDefault,
    message: prompt,
    choices: input.select.options.map((option: SelectOptions<T>): ListItem => {
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
