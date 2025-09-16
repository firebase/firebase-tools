"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveParams = exports.ParamValue = exports.isMultiSelectInput = exports.isResourceInput = exports.isSelectInput = exports.isTextInput = exports.resolveBoolean = exports.resolveList = exports.resolveString = exports.resolveInt = void 0;
const logger_1 = require("../../logger");
const error_1 = require("../../error");
const prompt_1 = require("../../prompt");
const functional_1 = require("../../functional");
const secretManager = require("../../gcp/secretManager");
const storage_1 = require("../../gcp/storage");
const cel_1 = require("./cel");
const secretManager_1 = require("../../gcp/secretManager");
function dependenciesCEL(expr) {
    const deps = [];
    const paramCapture = /{{ params\.(\w+) }}/g;
    let match;
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
function resolveInt(from, paramValues) {
    if (typeof from === "number") {
        return from;
    }
    return (0, cel_1.resolveExpression)("number", from, paramValues);
}
exports.resolveInt = resolveInt;
/**
 * Resolves a string field in a Build to an an actual string.
 * Fields can be literal or an expression written in a subset of the CEL specification.
 * We support the identity CEL {{ params.FOO }} and ternary operators {{ params.FOO == 24 ? params.BAR : 0 }}.
 * You can also use string-typed CEl expressions as part of an interpolation, region: "us-central-{{ params.ZONE }}"
 */
function resolveString(from, paramValues) {
    let output = from;
    const celCapture = /{{ .+? }}/g;
    const subExprs = from.match(celCapture);
    if (!subExprs || subExprs.length === 0) {
        return output;
    }
    for (const expr of subExprs) {
        const resolved = (0, cel_1.resolveExpression)("string", expr, paramValues);
        output = output.replace(expr, resolved);
    }
    return output;
}
exports.resolveString = resolveString;
/**
 * Resolves a FieldList in a Build to an an actual string[] value.
 * FieldLists can be a list of string | Expression<string>, or a single
 * Expression<string[]>.
 */
function resolveList(from, paramValues) {
    if (!from) {
        return [];
    }
    else if (Array.isArray(from)) {
        return from.map((entry) => resolveString(entry, paramValues));
    }
    else if (typeof from === "string") {
        return (0, cel_1.resolveExpression)("string[]", from, paramValues);
    }
    else {
        (0, functional_1.assertExhaustive)(from);
    }
}
exports.resolveList = resolveList;
/**
 * Resolves a boolean field in a Build to an an actual boolean value.
 * Fields can be literal or an expression written in a subset of the CEL specification.
 * We support the identity CEL {{ params.FOO }} and ternary operators {{ params.FOO == 24 ? params.BAR : true }}
 */
function resolveBoolean(from, paramValues) {
    if (typeof from === "boolean") {
        return from;
    }
    return (0, cel_1.resolveExpression)("boolean", from, paramValues);
}
exports.resolveBoolean = resolveBoolean;
/**
 * Determines whether an Input field value can be coerced to TextInput.
 */
function isTextInput(input) {
    return {}.hasOwnProperty.call(input, "text");
}
exports.isTextInput = isTextInput;
/**
 * Determines whether an Input field value can be coerced to SelectInput.
 */
function isSelectInput(input) {
    return {}.hasOwnProperty.call(input, "select");
}
exports.isSelectInput = isSelectInput;
/**
 * Determines whether an Input field value can be coerced to ResourceInput.
 */
function isResourceInput(input) {
    return {}.hasOwnProperty.call(input, "resource");
}
exports.isResourceInput = isResourceInput;
/**
 * Determines whether an Input field value can be coerced to MultiSelectInput.
 */
function isMultiSelectInput(input) {
    return {}.hasOwnProperty.call(input, "multiSelect");
}
exports.isMultiSelectInput = isMultiSelectInput;
/**
 * A type which contains the resolved value of a param, and metadata ensuring
 * that it's used in the correct way:
 * - ParamValues coming from a dotenv file will have all three legal type fields set.
 * - ParamValues coming from prompting a param will have type fields corresponding to
 *   the type of the Param.
 * - ParamValues coming from Cloud Secrets Manager will have a string type field set
 *   and isSecret = true, telling the Build process not to write the value to .env files.
 */
class ParamValue {
    constructor(rawValue, internal, types) {
        this.rawValue = rawValue;
        this.internal = internal;
        this.legalString = types.string || false;
        this.legalBoolean = types.boolean || false;
        this.legalNumber = types.number || false;
        this.legalList = types.list || false;
        this.delimiter = ",";
    }
    static fromList(ls, delimiter = ",") {
        const pv = new ParamValue(ls.join(delimiter), false, { list: true });
        pv.setDelimiter(delimiter);
        return pv;
    }
    setDelimiter(delimiter) {
        this.delimiter = delimiter;
    }
    // Returns this param's representation as it should be in .env files
    toString() {
        return this.rawValue;
    }
    // Returns this param's representatiom as it should be in process.env during runtime
    toSDK() {
        return this.legalList ? JSON.stringify(this.asList()) : this.toString();
    }
    asString() {
        return this.rawValue;
    }
    asBoolean() {
        return ["true", "y", "yes", "1"].includes(this.rawValue);
    }
    asList() {
        // Handle something like "['a', 'b', 'c']"
        if (this.rawValue.includes("[")) {
            // Convert quotes to apostrophes
            const unquoted = this.rawValue.replace(/'/g, '"');
            return JSON.parse(unquoted);
        }
        // Continue to handle something like "a,b,c"
        return this.rawValue.split(this.delimiter);
    }
    asNumber() {
        return +this.rawValue;
    }
}
exports.ParamValue = ParamValue;
/**
 * Calls the corresponding resolveX function for the type of a param.
 * To be used when resolving the default value of a param, if CEL.
 * It's an error to call this on a CEL expression that depends on params not already known in the currentEnv.
 */
function resolveDefaultCEL(type, expr, currentEnv) {
    const deps = dependenciesCEL(expr);
    const allDepsFound = deps.every((dep) => !!currentEnv[dep]);
    if (!allDepsFound) {
        throw new error_1.FirebaseError("Build specified parameter with un-resolvable default value " +
            expr +
            "; dependencies missing.");
    }
    switch (type) {
        case "boolean":
            return resolveBoolean(expr, currentEnv);
        case "string":
            return resolveString(expr, currentEnv);
        case "int":
            return resolveInt(expr, currentEnv);
        case "list":
            return resolveList(expr, currentEnv);
        default:
            throw new error_1.FirebaseError("Build specified parameter with default " + expr + " of unsupported type");
    }
}
/**
 * Tests whether a mooted ParamValue literal is of the correct type to be the value for a Param.
 */
function canSatisfyParam(param, value) {
    if (param.type === "string") {
        return typeof value === "string";
    }
    else if (param.type === "int") {
        return typeof value === "number" && Number.isInteger(value);
    }
    else if (param.type === "boolean") {
        return typeof value === "boolean";
    }
    else if (param.type === "list") {
        return Array.isArray(value);
    }
    else if (param.type === "secret") {
        return false;
    }
    (0, functional_1.assertExhaustive)(param);
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
async function resolveParams(params, firebaseConfig, userEnvs, nonInteractive, isEmulator = false) {
    const paramValues = populateDefaultParams(firebaseConfig);
    // TODO(vsfan@): should we ever reject param values from .env files based on the appearance of the string?
    const [resolved, outstanding] = (0, functional_1.partition)(params, (param) => {
        return {}.hasOwnProperty.call(userEnvs, param.name);
    });
    for (const param of resolved) {
        paramValues[param.name] = userEnvs[param.name];
    }
    const [needSecret, needPrompt] = (0, functional_1.partition)(outstanding, (param) => param.type === "secret");
    // The functions emulator will handle secrets
    if (!isEmulator) {
        for (const param of needSecret) {
            await handleSecret(param, firebaseConfig.projectId);
        }
    }
    if (nonInteractive && needPrompt.length > 0) {
        const envNames = outstanding.map((p) => p.name).join(", ");
        throw new error_1.FirebaseError(`In non-interactive mode but have no value for the following environment variables: ${envNames}\n` +
            "To continue, either run `firebase deploy` with an interactive terminal, or add values to a dotenv file. " +
            "For information regarding how to use dotenv files, see https://firebase.google.com/docs/functions/config-env");
    }
    for (const param of needPrompt) {
        const promptable = param;
        let paramDefault = promptable.default;
        if (paramDefault && (0, cel_1.isCelExpression)(paramDefault)) {
            paramDefault = resolveDefaultCEL(param.type, paramDefault, paramValues);
        }
        if (paramDefault && !canSatisfyParam(param, paramDefault)) {
            throw new error_1.FirebaseError("Parameter " + param.name + " has default value " + paramDefault + " of wrong type");
        }
        paramValues[param.name] = await promptParam(param, firebaseConfig.projectId, paramDefault);
    }
    return paramValues;
}
exports.resolveParams = resolveParams;
function populateDefaultParams(config) {
    const defaultParams = {};
    if (config.databaseURL && config.databaseURL !== "") {
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
    if (config.storageBucket && config.storageBucket !== "") {
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
async function handleSecret(secretParam, projectId) {
    const metadata = await secretManager.getSecretMetadata(projectId, secretParam.name, "latest");
    if (!metadata.secret) {
        const secretValue = await (0, prompt_1.password)({
            message: `This secret will be stored in Cloud Secret Manager (https://cloud.google.com/secret-manager/pricing) as ${secretParam.name}. Enter a value for ${secretParam.label || secretParam.name}:`,
        });
        await secretManager.createSecret(projectId, secretParam.name, (0, secretManager_1.labels)());
        await secretManager.addVersion(projectId, secretParam.name, secretValue);
        return secretValue;
    }
    else if (!metadata.secretVersion) {
        throw new error_1.FirebaseError(`Cloud Secret Manager has no latest version of the secret defined by param ${secretParam.label || secretParam.name}`);
    }
    else if (metadata.secretVersion.state === "DESTROYED" ||
        metadata.secretVersion.state === "DISABLED") {
        throw new error_1.FirebaseError(`Cloud Secret Manager's latest version of secret '${secretParam.label || secretParam.name} is in illegal state ${metadata.secretVersion.state}`);
    }
}
/**
 * Returns the resolved value of a user-defined Functions parameter.
 * Functions params are defined by the output of the Functions SDK, but their value is not set until deploy-time.
 *
 * For most param types, we check the contents of the dotenv files first for a matching key, then interactively prompt the user.
 * When the CLI is running in non-interactive mode or with the --force argument, it is an error for a param to be undefined in dotenvs.
 */
async function promptParam(param, projectId, resolvedDefault) {
    if (param.type === "string") {
        const provided = await promptStringParam(param, projectId, resolvedDefault);
        return new ParamValue(provided.toString(), false, { string: true });
    }
    else if (param.type === "int") {
        const provided = await promptIntParam(param, resolvedDefault);
        return new ParamValue(provided.toString(), false, { number: true });
    }
    else if (param.type === "boolean") {
        const provided = await promptBooleanParam(param, resolvedDefault);
        return new ParamValue(provided.toString(), false, { boolean: true });
    }
    else if (param.type === "list") {
        const provided = await promptList(param, projectId, resolvedDefault);
        return ParamValue.fromList(provided, param.delimiter);
    }
    else if (param.type === "secret") {
        throw new error_1.FirebaseError(`Somehow ended up trying to interactively prompt for secret parameter ${param.name}, which should never happen.`);
    }
    (0, functional_1.assertExhaustive)(param);
}
async function promptList(param, projectId, resolvedDefault) {
    if (!param.input) {
        const defaultToText = { text: {} };
        param.input = defaultToText;
    }
    let prompt;
    if (isSelectInput(param.input)) {
        throw new error_1.FirebaseError("List params cannot have non-list selector inputs");
    }
    else if (isMultiSelectInput(param.input)) {
        prompt = `Select a value for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
        return promptSelectMultiple(prompt, param.input, resolvedDefault, (res) => res);
    }
    else if (isTextInput(param.input)) {
        prompt = `Enter a list of strings (delimiter: ${param.delimiter ? param.delimiter : ","}) for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        return promptText(prompt, param.input, resolvedDefault, (res) => {
            return res.split(param.delimiter || ",");
        });
    }
    else if (isResourceInput(param.input)) {
        prompt = `Select values for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        return promptResourceStrings(prompt, param.input, projectId);
    }
    else {
        (0, functional_1.assertExhaustive)(param.input);
    }
}
async function promptBooleanParam(param, resolvedDefault) {
    if (!param.input) {
        const defaultToText = { text: {} };
        param.input = defaultToText;
    }
    const isTruthyInput = (res) => ["true", "y", "yes", "1"].includes(res.toLowerCase());
    let prompt;
    if (isSelectInput(param.input)) {
        prompt = `Select a value for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
        return promptSelect(prompt, param.input, resolvedDefault, isTruthyInput);
    }
    else if (isMultiSelectInput(param.input)) {
        throw new error_1.FirebaseError("Non-list params cannot have multi selector inputs");
    }
    else if (isTextInput(param.input)) {
        prompt = `Enter a boolean value for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        return promptText(prompt, param.input, resolvedDefault, isTruthyInput);
    }
    else if (isResourceInput(param.input)) {
        throw new error_1.FirebaseError("Boolean params cannot have Cloud Resource selector inputs");
    }
    else {
        (0, functional_1.assertExhaustive)(param.input);
    }
}
async function promptStringParam(param, projectId, resolvedDefault) {
    if (!param.input) {
        const defaultToText = { text: {} };
        param.input = defaultToText;
    }
    let prompt;
    if (isResourceInput(param.input)) {
        prompt = `Select a value for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        return promptResourceString(prompt, param.input, projectId, resolvedDefault);
    }
    else if (isMultiSelectInput(param.input)) {
        throw new error_1.FirebaseError("Non-list params cannot have multi selector inputs");
    }
    else if (isSelectInput(param.input)) {
        prompt = `Select a value for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
        return promptSelect(prompt, param.input, resolvedDefault, (res) => res);
    }
    else if (isTextInput(param.input)) {
        prompt = `Enter a string value for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        return promptText(prompt, param.input, resolvedDefault, (res) => res);
    }
    else {
        (0, functional_1.assertExhaustive)(param.input);
    }
}
async function promptIntParam(param, resolvedDefault) {
    if (!param.input) {
        const defaultToText = { text: {} };
        param.input = defaultToText;
    }
    let prompt;
    if (isSelectInput(param.input)) {
        prompt = `Select a value for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        prompt += "\nSelect an option with the arrow keys, and use Enter to confirm your choice. ";
        return promptSelect(prompt, param.input, resolvedDefault, (res) => {
            if (isNaN(+res)) {
                return { message: `"${res}" could not be converted to a number.` };
            }
            if (res.includes(".")) {
                return { message: `${res} is not an integer value.` };
            }
            return +res;
        });
    }
    else if (isMultiSelectInput(param.input)) {
        throw new error_1.FirebaseError("Non-list params cannot have multi selector inputs");
    }
    else if (isTextInput(param.input)) {
        prompt = `Enter an integer value for ${param.label || param.name}:`;
        if (param.description) {
            prompt += ` \n(${param.description})`;
        }
        return promptText(prompt, param.input, resolvedDefault, (res) => {
            if (isNaN(+res)) {
                return { message: `"${res}" could not be converted to a number.` };
            }
            if (res.includes(".")) {
                return { message: `${res} is not an integer value.` };
            }
            return +res;
        });
    }
    else if (isResourceInput(param.input)) {
        throw new error_1.FirebaseError("Numeric params cannot have Cloud Resource selector inputs");
    }
    else {
        (0, functional_1.assertExhaustive)(param.input);
    }
}
async function promptResourceString(prompt, input, projectId, resolvedDefault) {
    const notFound = new error_1.FirebaseError(`No instances of ${input.resource.type} found.`);
    switch (input.resource.type) {
        case "storage.googleapis.com/Bucket":
            const buckets = await (0, storage_1.listBuckets)(projectId);
            if (buckets.length === 0) {
                throw notFound;
            }
            const forgedInput = {
                select: {
                    options: buckets.map((bucketName) => {
                        return { label: bucketName, value: bucketName };
                    }),
                },
            };
            return promptSelect(prompt, forgedInput, resolvedDefault, (res) => res);
        default:
            logger_1.logger.warn(`Warning: unknown resource type ${input.resource.type}; defaulting to raw text input...`);
            return promptText(prompt, { text: {} }, resolvedDefault, (res) => res);
    }
}
async function promptResourceStrings(prompt, input, projectId) {
    const notFound = new error_1.FirebaseError(`No instances of ${input.resource.type} found.`);
    switch (input.resource.type) {
        case "storage.googleapis.com/Bucket":
            const buckets = await (0, storage_1.listBuckets)(projectId);
            if (buckets.length === 0) {
                throw notFound;
            }
            const forgedInput = {
                multiSelect: {
                    options: buckets.map((bucketName) => {
                        return { label: bucketName, value: bucketName };
                    }),
                },
            };
            return promptSelectMultiple(prompt, forgedInput, undefined, (res) => res);
        default:
            logger_1.logger.warn(`Warning: unknown resource type ${input.resource.type}; defaulting to raw text input...`);
            return promptText(prompt, { text: {} }, undefined, (res) => res.split(","));
    }
}
function shouldRetry(obj) {
    return typeof obj === "object" && obj.message !== undefined;
}
async function promptText(prompt, textInput, resolvedDefault, converter) {
    const res = await (0, prompt_1.input)({
        default: resolvedDefault,
        message: prompt,
    });
    if (textInput.text.validationRegex) {
        const userRe = new RegExp(textInput.text.validationRegex);
        if (!userRe.test(res)) {
            logger_1.logger.error(textInput.text.validationErrorMessage ||
                `Input did not match provided validator ${userRe.toString()}, retrying...`);
            return promptText(prompt, textInput, resolvedDefault, converter);
        }
    }
    // TODO(vsfan): the toString() is because PromptOnce()'s return type of string
    // is wrong--it will return the type of the default if selected. Remove this
    // hack once we fix the prompt.ts metaprogramming.
    const converted = converter(res.toString());
    if (shouldRetry(converted)) {
        logger_1.logger.error(converted.message);
        return promptText(prompt, textInput, resolvedDefault, converter);
    }
    return converted;
}
async function promptSelect(prompt, input, resolvedDefault, converter) {
    const response = await (0, prompt_1.select)({
        default: resolvedDefault,
        message: prompt,
        choices: input.select.options.map((option) => {
            return {
                checked: false,
                name: option.label,
                value: option.value.toString(),
            };
        }),
    });
    const converted = converter(response);
    if (shouldRetry(converted)) {
        logger_1.logger.error(converted.message);
        return promptSelect(prompt, input, resolvedDefault, converter);
    }
    return converted;
}
async function promptSelectMultiple(prompt, input, resolvedDefault, converter) {
    const response = await (0, prompt_1.checkbox)({
        default: resolvedDefault,
        message: prompt,
        choices: input.multiSelect.options.map((option) => {
            return {
                checked: false,
                name: option.label,
                value: option.value.toString(),
            };
        }),
    });
    const converted = converter(response);
    if (shouldRetry(converted)) {
        logger_1.logger.error(converted.message);
        return promptSelectMultiple(prompt, input, resolvedDefault, converter);
    }
    return converted;
}
