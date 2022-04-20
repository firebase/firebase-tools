import * as fs from "fs-extra";
import { ParsedTriggerDefinition } from "../../emulator/functionsEmulatorShared";
import * as path from "path";
import * as paramHelper from "../paramHelper";
import * as specHelper from "./specHelper";
import * as localHelper from "../localHelper";
import * as triggerHelper from "./triggerHelper";
import { ExtensionSpec, Param, ParamType, Resource } from "../extensionsApi";
import * as extensionsHelper from "../extensionsHelper";
import * as planner from "../../deploy/extensions/planner";
import { Config } from "../../config";
import { FirebaseError } from "../../error";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { needProjectId } from "../../projectUtils";
import { Emulators } from "../../emulator/types";
import { SecretEnvVar } from "../../deploy/functions/backend";

export async function buildOptions(options: any): Promise<any> {
  const extDevDir = localHelper.findExtensionYaml(process.cwd());
  options.extDevDir = extDevDir;
  const spec = await specHelper.readExtensionYaml(extDevDir);
  extensionsHelper.validateSpec(spec);

  const params = getParams(options, spec);

  extensionsHelper.validateCommandLineParams(params, spec.params);

  const functionResources = specHelper.getFunctionResourcesWithParamSubstitution(spec, params);
  let testConfig;
  if (options.testConfig) {
    testConfig = readTestConfigFile(options.testConfig);
    checkTestConfig(testConfig, functionResources);
  }
  options.config = buildConfig(functionResources, testConfig);
  options.extDevEnv = params;
  const functionEmuTriggerDefs: ParsedTriggerDefinition[] = functionResources.map((r) =>
    triggerHelper.functionResourceToEmulatedTriggerDefintion(r)
  );
  options.extDevTriggers = functionEmuTriggerDefs;
  options.extDevNodeVersion = specHelper.getNodeVersion(functionResources);
  return options;
}

// TODO: Better name? Also, should this be in extensionsEmulator instead?
export async function getExtensionFunctionInfo(
  instance: planner.InstanceSpec,
  paramValues: Record<string, string>
): Promise<{
  nodeMajorVersion: number;
  extensionTriggers: ParsedTriggerDefinition[];
  nonSecretEnv: Record<string, string>;
  secretEnvVariables: SecretEnvVar[];
}> {
  const spec = await planner.getExtensionSpec(instance);
  const functionResources = specHelper.getFunctionResourcesWithParamSubstitution(spec, paramValues);
  const extensionTriggers: ParsedTriggerDefinition[] = functionResources
    .map((r) => triggerHelper.functionResourceToEmulatedTriggerDefintion(r))
    .map((trigger) => {
      trigger.name = `ext-${instance.instanceId}-${trigger.name}`;
      return trigger;
    });
  const nodeMajorVersion = specHelper.getNodeVersion(functionResources);
  const nonSecretEnv = getNonSecretEnv(spec.params, paramValues);
  const secretEnvVariables = getSecretEnvVars(spec.params, paramValues);
  return {
    extensionTriggers,
    nodeMajorVersion,
    nonSecretEnv,
    secretEnvVariables,
  };
}

const isSecretParam = (p: Param) =>
  p.type === extensionsHelper.SpecParamType.SECRET || p.type === ParamType.SECRET;

/**
 * getNonSecretEnv checks extension spec for secret params, and returns env without those secret params
 * @param params A list of params to check for secret params
 * @param paramValues A Record of all params to their values
 */
export function getNonSecretEnv(
  params: Param[],
  paramValues: Record<string, string>
): Record<string, string> {
  const getNonSecretEnv: Record<string, string> = Object.assign({}, paramValues);
  const secretParams = params.filter(isSecretParam);
  for (const p of secretParams) {
    delete getNonSecretEnv[p.param];
  }
  return getNonSecretEnv;
}

/**
 * getSecretEnvVars checks which params are secret, and returns a list of SecretEnvVar for each one that is is in use
 * @param params A list of params to check for secret params
 * @param paramValues A Record of all params to their values
 */
export function getSecretEnvVars(
  params: Param[],
  paramValues: Record<string, string>
): SecretEnvVar[] {
  const secretEnvVar: SecretEnvVar[] = [];
  const secretParams = params.filter(isSecretParam);
  for (const s of secretParams) {
    if (paramValues[s.param]) {
      const [, projectId, , secret, , version] = paramValues[s.param].split("/");
      secretEnvVar.push({
        key: s.param,
        secret,
        projectId,
        version,
      });
    }
    // TODO: Throw an error if a required secret is missing?
  }
  return secretEnvVar;
}

// Exported for testing
export function getParams(options: any, extensionSpec: ExtensionSpec) {
  const projectId = needProjectId(options);
  const userParams = paramHelper.readEnvFile(options.testParams);
  const autoParams = {
    PROJECT_ID: projectId,
    EXT_INSTANCE_ID: extensionSpec.name,
    DATABASE_INSTANCE: projectId,
    DATABASE_URL: `https://${projectId}.firebaseio.com`,
    STORAGE_BUCKET: `${projectId}.appspot.com`,
  };
  const unsubbedParamsWithoutDefaults = Object.assign(autoParams, userParams);

  const unsubbedParams = extensionsHelper.populateDefaultParams(
    unsubbedParamsWithoutDefaults,
    extensionSpec.params
  );
  // Run a substitution to support params that reference other params.
  return extensionsHelper.substituteParams<Record<string, string>>(unsubbedParams, unsubbedParams);
}

/**
 * Checks and warns if the test config is missing fields
 * that are relevant for the extension being emulated.
 */
function checkTestConfig(testConfig: { [key: string]: any }, functionResources: Resource[]) {
  const logger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
  if (!testConfig.functions && functionResources.length) {
    logger.log(
      "WARN",
      "This extension uses functions," +
        "but 'firebase.json' provided by --test-config is missing a top-level 'functions' object." +
        "Functions will not be emulated."
    );
  }

  if (!testConfig.firestore && shouldEmulateFirestore(functionResources)) {
    logger.log(
      "WARN",
      "This extension interacts with Cloud Firestore," +
        "but 'firebase.json' provided by --test-config is missing a top-level 'firestore' object." +
        "Cloud Firestore will not be emulated."
    );
  }

  if (!testConfig.database && shouldEmulateDatabase(functionResources)) {
    logger.log(
      "WARN",
      "This extension interacts with Realtime Database," +
        "but 'firebase.json' provided by --test-config is missing a top-level 'database' object." +
        "Realtime Database will not be emulated."
    );
  }

  if (!testConfig.storage && shouldEmulateStorage(functionResources)) {
    logger.log(
      "WARN",
      "This extension interacts with Cloud Storage," +
        "but 'firebase.json' provided by --test-config is missing a top-level 'storage' object." +
        "Cloud Storage will not be emulated."
    );
  }
}

/**
 * Reads a test config file.
 * @param testConfigPath filepath to a firebase.json style config file.
 */
function readTestConfigFile(testConfigPath: string): { [key: string]: any } {
  try {
    const buf = fs.readFileSync(path.resolve(testConfigPath));
    return JSON.parse(buf.toString());
  } catch (err: any) {
    throw new FirebaseError(`Error reading --test-config file: ${err.message}\n`, {
      original: err,
    });
  }
}

function buildConfig(
  functionResources: Resource[],
  testConfig?: { [key: string]: string }
): Config {
  const config = new Config(testConfig || {}, { projectDir: process.cwd(), cwd: process.cwd() });

  const emulateFunctions = shouldEmulateFunctions(functionResources);
  if (!testConfig) {
    // If testConfig was provided, don't add any new blocks.
    if (emulateFunctions) {
      config.set("functions", {});
    }
    if (shouldEmulateFirestore(functionResources)) {
      config.set("firestore", {});
    }
    if (shouldEmulateDatabase(functionResources)) {
      config.set("database", {});
    }
    if (shouldEmulatePubsub(functionResources)) {
      config.set("pubsub", {});
    }
    if (shouldEmulateStorage(functionResources)) {
      config.set("storage", {});
    }
  }

  if (config.src.functions) {
    // Switch functions source to what is provided in the extension.yaml
    // to match the behavior of deployed extensions.
    const sourceDirectory = getFunctionSourceDirectory(functionResources);
    config.set("functions.source", sourceDirectory);
  }
  return config;
}

/**
 * Finds the source directory from extension.yaml to use for emulating functions.
 * Errors if the extension.yaml contins function resources with different or missing
 * values for properties.sourceDirectory.
 * @param functionResources An array of function type resources
 */
function getFunctionSourceDirectory(functionResources: Resource[]): string {
  let sourceDirectory;
  for (const r of functionResources) {
    // If not specified, default sourceDirectory to "functions"
    const dir = r.properties?.sourceDirectory || "functions";
    if (!sourceDirectory) {
      sourceDirectory = dir;
    } else if (sourceDirectory !== dir) {
      throw new FirebaseError(
        `Found function resources with different sourceDirectories: '${sourceDirectory}' and '${dir}'. The extensions emulator only supports a single sourceDirectory.`
      );
    }
  }
  return sourceDirectory || "functions";
}

function shouldEmulateFunctions(resources: Resource[]): boolean {
  return resources.length > 0;
}

function shouldEmulate(emulatorName: string, resources: Resource[]): boolean {
  for (const r of resources) {
    const eventType: string = r.properties?.eventTrigger?.eventType || "";
    if (eventType.includes(emulatorName)) {
      return true;
    }
  }
  return false;
}

function shouldEmulateFirestore(resources: Resource[]): boolean {
  return shouldEmulate("cloud.firestore", resources);
}

function shouldEmulateDatabase(resources: Resource[]): boolean {
  return shouldEmulate("google.firebase.database", resources);
}

function shouldEmulatePubsub(resources: Resource[]): boolean {
  return shouldEmulate("google.pubsub", resources);
}

function shouldEmulateStorage(resources: Resource[]): boolean {
  return shouldEmulate("google.storage", resources);
}
