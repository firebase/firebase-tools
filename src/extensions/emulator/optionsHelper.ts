import * as fs from "fs-extra";
import * as _ from "lodash";
import { ParsedTriggerDefinition } from "../../emulator/functionsEmulatorShared";
import * as path from "path";
import * as paramHelper from "../paramHelper";
import * as specHelper from "./specHelper";
import * as localHelper from "../localHelper";
import * as triggerHelper from "./triggerHelper";
import { ExtensionSpec, Resource } from "../extensionsApi";
import * as extensionsHelper from "../extensionsHelper";
import { Config } from "../../config";
import { FirebaseError } from "../../error";
import { EmulatorLogger } from "../../emulator/emulatorLogger";
import { needProjectId } from "../../projectUtils";
import { Emulators } from "../../emulator/types";

export async function buildOptions(options: any): Promise<any> {
  const extensionDir = localHelper.findExtensionYaml(process.cwd());
  options.extensionDir = extensionDir;
  const spec = await specHelper.readExtensionYaml(extensionDir);
  extensionsHelper.validateSpec(spec);

  const params = getParams(options, spec);

  extensionsHelper.validateCommandLineParams(params, spec.params);

  const functionResources = specHelper.getFunctionResourcesWithParamSubstitution(
    spec,
    params
  ) as Resource[];
  let testConfig;
  if (options.testConfig) {
    testConfig = readTestConfigFile(options.testConfig);
    checkTestConfig(testConfig, functionResources);
  }
  options.config = buildConfig(functionResources, testConfig);
  options.extensionEnv = params;
  const functionEmuTriggerDefs: ParsedTriggerDefinition[] = functionResources.map((r) =>
    triggerHelper.functionResourceToEmulatedTriggerDefintion(r)
  );
  options.extensionTriggers = functionEmuTriggerDefs;
  options.extensionNodeVersion = specHelper.getNodeVersion(functionResources);
  return options;
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
  } catch (err) {
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
    let dir = _.get(r, "properties.sourceDirectory");
    // If not specified, default sourceDirectory to "functions"
    if (!dir) {
      dir = "functions";
    }
    if (!sourceDirectory) {
      sourceDirectory = dir;
    } else if (sourceDirectory != dir) {
      throw new FirebaseError(
        `Found function resources with different sourceDirectories: '${sourceDirectory}' and '${dir}'. The extensions emulator only supports a single sourceDirectory.`
      );
    }
  }
  return sourceDirectory;
}

function shouldEmulateFunctions(resources: Resource[]): boolean {
  return resources.length > 0;
}

function shouldEmulate(emulatorName: string, resources: Resource[]): boolean {
  for (const r of resources) {
    const eventType: string = _.get(r, "properties.eventTrigger.eventType", "");
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
