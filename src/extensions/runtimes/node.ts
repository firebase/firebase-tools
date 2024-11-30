import * as path from "path";
import { markedTerminal } from "marked-terminal";
import { marked } from "marked";

import { Options } from "../../options";
import { isObject } from "../../error";
import { ExtensionSpec, ParamType } from "../types";
import { confirm } from "../../prompt";
import * as secretsUtils from "../secretsUtils";
import { logLabeledBullet } from "../../utils";
import {
  writeFile,
  copyDirectory,
  toTitleCase,
  longestCommonPrefix,
  lowercaseFirstLetter,
  fixDarkBlueText,
  getInstallPathPrefix,
  getCodebaseDir,
  isTypescriptCodebase,
} from "./common";
import { ALLOWED_EVENT_ARC_REGIONS } from "../askUserForEventsConfig";
import { SpecParamType } from "../extensionsHelper";
import { FirebaseError, getErrMsg } from "../../error";
import { spawnWithOutput } from "../../init/spawn";

marked.use(markedTerminal() as any);

export const SDK_GENERATION_VERSION = "1.0.0";
export const FIREBASE_FUNCTIONS_VERSION = ">=5.1.0";
export const TYPESCRIPT_VERSION = "^4.9.0";

function makePackageName(extensionRef: string | undefined, name: string): string {
  if (!extensionRef) {
    return `@firebase-extensions/local-${name}-sdk`;
  }
  const pub = extensionRef.split("/")[0];
  return `@firebase-extensions/${pub}-${name}-sdk`;
}

function makeTypeName(name: string): string {
  let typeName = name.replace(/_/g, " ");
  typeName = typeName.replace(/\w\S*/g, toTitleCase);
  return typeName.replace(/ /g, "") + "Param";
}

// A convenient map for converting prefixes back and forth
const systemPrefixes: Record<string, string> = {
  "firebaseextensions.v1beta.function": "_FUNCTION",
  "firebaseextensions.v1beta.v2function": "_V2FUNCTION",
  FUNCTION: "firebaseextensions.v1beta.function",
  V2FUNCTION: "firebaseextensions.v1beta.v2function",
};

// Goes both forwards and reverse
function convertSystemPrefix(prefix: string): string {
  return systemPrefixes[prefix];
}

function makeSystemTypeName(name: string): string {
  if (name.includes("/")) {
    const prefix = name.split("/")[0];
    let typeName = name.split("/")[1];
    typeName = typeName.replace(/([A-Z])/g, " $1").trim();
    typeName = `${convertSystemPrefix(prefix)}_${typeName}`;
    return `System${makeTypeName(typeName)}`;
  }
  // This shouldn't happen. All system params should have a name format like
  // "firebaseextensions.v1beta.function/location".
  return makeTypeName(name);
}

function makeSystemParamName(name: string): string {
  if (name.includes("/")) {
    const prefix = name.split("/")[0];
    let paramName = name.split("/")[1];
    paramName = paramName.replace(/([A-Z])/g, " $1").trim();
    paramName = paramName.toUpperCase();
    paramName = paramName.replace(/ /g, "_");
    return `${convertSystemPrefix(prefix)}_${paramName}`;
  }
  return name;
}

function makeClassName(name: string): string {
  let className = name.replace(/[_-]/g, " ");
  className = className.replace(/\w\S*/g, toTitleCase);
  return className.replace(/ /g, "");
}

// A multi approach method to figure out the event name.
function makeEventName(name: string, prefix: string): string {
  let eventName: string;
  const versionedEvent = /^(?:[^.]+[.])+(?:[vV]\d+[.])(?<event>.*)$/;
  const match = versionedEvent.exec(name);
  if (match) {
    // Most reliable: event is the thing after the version.
    eventName = match[1];
  } else if (prefix.length < name.length) {
    // No version, go with removing the longest common prefix instead.
    eventName = name.substring(prefix.length);
  } else {
    // Take the last part of the event name.
    const parts = name.split(".");
    eventName = parts[parts.length - 1];
  }
  const allCaps = /^[A-Z._-]+$/;
  eventName = allCaps.exec(eventName) ? eventName : eventName.replace(/([A-Z])/g, " $1").trim();
  eventName = eventName.replace(/[._-]/g, " ");
  eventName = eventName.toLowerCase().startsWith("on") ? eventName : "on " + eventName;
  eventName = eventName.replace(/\w\S*/g, toTitleCase);
  eventName = eventName.replace(/ /g, "");
  eventName = eventName.charAt(0).toLowerCase() + eventName.substring(1);

  return eventName;
}

function addPeerDependency(
  pkgJson: Record<string, unknown>,
  dependency: string,
  version: string,
): void {
  if (!pkgJson.peerDependencies) {
    pkgJson.peerDependencies = {};
  }
  if (!isObject(pkgJson.peerDependencies)) {
    throw new FirebaseError("Internal error generating peer dependencies.");
  }
  pkgJson.peerDependencies[dependency] = version;
}

/**
 * writeSDK generates and writes SDK files for the given extension
 * @param extensionRef The extension ref of a published extension
 * @param localPath The localPath of a local extension
 * @param spec The spec for the extension
 * @param options The options from the ext:sdk:install command
 * @return Usage instructions to print on screen after install completes
 */
export async function writeSDK(
  extensionRef: string | undefined,
  localPath: string | undefined,
  spec: ExtensionSpec,
  options: Options,
): Promise<string> {
  const sdkLines: string[] = []; // index.ts file
  const className = makeClassName(spec.name);

  let dirPath;
  if (extensionRef) {
    dirPath = path.join(getInstallPathPrefix(options), extensionRef.replace("@", "/"));
  } else if (localPath) {
    dirPath = path.join(getInstallPathPrefix(options), "local", spec.name, spec.version);
    // In order to deploy a local extension, it needs to be copied to the server.
    // So we need to copy the localPath directory to the dirPath/source directory.
    if (
      await confirm({
        message: `Copy local extension source to deployment directory? (required for successful deploy)`,
        nonInteractive: options.nonInteractive,
        force: options.force,
        default: true,
      })
    ) {
      const newLocalPath = path.join(dirPath, "src");
      await copyDirectory(localPath, newLocalPath, options);
      localPath = newLocalPath.replace(options.projectRoot || ".", ".");
    }
  }

  if (!dirPath) {
    // This shouldn't be possible
    throw new FirebaseError(
      "Invalid extension definition. Must have either extensionRef or localPath",
    );
  }

  const packageName = makePackageName(extensionRef, spec.name);
  // package.json
  const pkgJson: Record<string, unknown> = {
    name: packageName,
    version: `${SDK_GENERATION_VERSION}`,
    description: `Generated SDK for ${spec.displayName || spec.name}@${spec.version}`,
    main: "./output/index.js",
    private: true,
    scripts: {
      build: "tsc",
      "build:watch": "npm run build && tsc --watch",
    },
    devDependencies: {
      typescript: TYPESCRIPT_VERSION,
    },
  };

  // tsconfig.json
  const tsconfigJson = {
    compilerOptions: {
      declaration: true,
      declarationMap: true,
      module: "commonjs",
      strict: true,
      target: "es2017",
      removeComments: false,
      outDir: "output",
    },
  };

  // index.ts file
  sdkLines.push("/**");
  sdkLines.push(` * ${spec.displayName || spec.name} SDK for ${spec.name}@${spec.version}`);
  sdkLines.push(" *");
  sdkLines.push(" * When filing bugs or feature requests please specify:");
  if (extensionRef) {
    sdkLines.push(
      ` *   "Extensions SDK v${SDK_GENERATION_VERSION} for ${spec.name}@${spec.version}"`,
    );
  } else {
    sdkLines.push(` *   "Extensions SDK v${SDK_GENERATION_VERSION} for Local extension.`);
  }
  sdkLines.push(" * https://github.com/firebase/firebase-tools/issues/new/choose");
  sdkLines.push(" *");
  sdkLines.push(" * GENERATED FILE. DO NOT EDIT.");
  sdkLines.push(" */\n");

  // Imports
  const hasEvents = spec.events && spec.events.length > 0;
  if (hasEvents) {
    sdkLines.push(`import { CloudEvent } from "firebase-functions/v2";`);
    sdkLines.push(
      `import { onCustomEventPublished, EventarcTriggerOptions } from "firebase-functions/v2/eventarc";`,
    );
    addPeerDependency(pkgJson, "firebase-functions", FIREBASE_FUNCTIONS_VERSION);
  }
  const usesSecrets = secretsUtils.usesSecrets(spec);
  if (usesSecrets) {
    sdkLines.push(`import { defineSecret } from "firebase-functions/params";`);
    addPeerDependency(pkgJson, "firebase-functions", FIREBASE_FUNCTIONS_VERSION);
  }
  if (hasEvents || usesSecrets) {
    sdkLines.push("");
  }

  // Types
  if (hasEvents) {
    sdkLines.push(
      `export type EventCallback<T> = (event: CloudEvent<T>) => unknown | Promise<unknown>;`,
    );
    sdkLines.push(
      `export type SimpleEventarcTriggerOptions = Omit<EventarcTriggerOptions, 'eventType' | 'channel' | 'region'>;`,
    );
    sdkLines.push(`export type EventArcRegionType = "${ALLOWED_EVENT_ARC_REGIONS.join('" | "')}";`);
  }
  if (usesSecrets) {
    sdkLines.push("export type SecretParam = ReturnType<typeof defineSecret>;");
  }

  // Define types for any (multi)select parameters
  if (spec.params && Array.isArray(spec.params) && spec.params.length > 0) {
    for (const param of spec.params) {
      let line: string;
      if (
        param.type === ParamType.SELECT ||
        param.type === ParamType.MULTISELECT ||
        param.type === SpecParamType.SELECT ||
        param.type === SpecParamType.MULTISELECT
      ) {
        line = `export type ${makeTypeName(param.param)} =`;
        param.options?.forEach((opt, i) => {
          if (i === 0) {
            line = line.concat(` "${opt.value}"`);
          } else {
            line = line.concat(` | "${opt.value}"`);
          }
        });
        line = line.concat(";");
        sdkLines.push(line);
      }
    }
  }
  sdkLines.push("");

  // Define types for system param (multi)select parameters
  if (spec.systemParams && Array.isArray(spec.systemParams) && spec.systemParams.length > 0) {
    for (const sysParam of spec.systemParams) {
      let line: string;
      if (sysParam.type === ParamType.SELECT || sysParam.type === ParamType.MULTISELECT) {
        line = `export type ${makeSystemTypeName(sysParam.param)} =`;
        sysParam.options?.forEach((opt, i) => {
          if (i === 0) {
            line = line.concat(` "${opt.value}"`);
          } else {
            line = line.concat(` | "${opt.value}"`);
          }
        });
        line = line.concat(";");
        sdkLines.push(line);
      }
    }
  }
  sdkLines.push("");

  // Define the params
  sdkLines.push("/**");
  sdkLines.push(` * Parameters for ${spec.name}@${spec.version} extension`);
  sdkLines.push(" */");
  sdkLines.push(`export interface ${className}Params {`);

  for (const param of spec.params) {
    const opt = param.required ? "" : "?";

    sdkLines.push("  /**");
    sdkLines.push(`   * ${param.label}`);
    if (param.validationRegex && !param.validationRegex.includes("*/")) {
      sdkLines.push(`   * - Validation regex: ${param.validationRegex}`);
    }
    sdkLines.push("   */");

    switch (param.type) {
      case ParamType.STRING:
      case SpecParamType.STRING:
        sdkLines.push(`  ${param.param}${opt}: string;`);
        break;
      case ParamType.MULTISELECT:
      case SpecParamType.MULTISELECT:
        sdkLines.push(`  ${param.param}${opt}: ${makeTypeName(param.param)}[];`);
        break;
      case ParamType.SELECT:
      case SpecParamType.SELECT:
        sdkLines.push(`  ${param.param}${opt}: ${makeTypeName(param.param)};`);
        break;
      case ParamType.SECRET:
      case SpecParamType.SECRET:
        sdkLines.push(`  ${param.param}${opt}: SecretParam;`);
        break;
      case ParamType.SELECT_RESOURCE:
      case SpecParamType.SELECTRESOURCE:
        // We can't really do anything better. There are no
        // typescript types based on regex. Maybe we could make a
        // class with a setter, but it would be a runtime error. I'm
        // not sure how helpful that would be.
        sdkLines.push(`  ${param.param}${opt}: string;`);
        break;

      default:
        // This is technically possible since param.type is not a required field.
        // Assume string, and add a comment
        sdkLines.push(`  ${param.param}${opt}: string;  // Assuming string for unknown type`);
    }
    sdkLines.push("");
  }

  if (hasEvents) {
    sdkLines.push("  /**");
    sdkLines.push(`   * Event Arc Region`);
    sdkLines.push("   */");
    sdkLines.push("  _EVENT_ARC_REGION?: EventArcRegionType\n");
  }

  for (const sysParam of spec.systemParams) {
    const opt = sysParam.required ? "" : "?";

    sdkLines.push("  /**");
    sdkLines.push(`   * ${sysParam.label}`);
    if (sysParam.validationRegex && !sysParam.validationRegex.includes("*/")) {
      sdkLines.push(`   * - Validation regex: ${sysParam.validationRegex}`);
    }
    sdkLines.push("   */");

    switch (sysParam.type) {
      case ParamType.STRING:
        sdkLines.push(`  ${makeSystemParamName(sysParam.param)}${opt}: string;`);
        break;
      case ParamType.MULTISELECT:
        sdkLines.push(
          `  ${makeSystemParamName(sysParam.param)}${opt}: ${makeSystemTypeName(sysParam.param)}[];`,
        );
        break;
      case ParamType.SELECT:
        sdkLines.push(
          `  ${makeSystemParamName(sysParam.param)}${opt}: ${makeSystemTypeName(sysParam.param)};`,
        );
        break;
      case ParamType.SECRET:
        sdkLines.push(`  ${makeSystemParamName(sysParam.param)}${opt}: SecretParam;`);
        break;
      case ParamType.SELECT_RESOURCE:
        // We can't really do anything better. There are no
        // typescript types based on regex. Maybe we could make a
        // class with a setter, but it would be a runtime error. I'm
        // not sure how helpful that would be.
        sdkLines.push(`  ${sysParam.param}${opt}: string;`);
        break;
      default:
        throw new FirebaseError(
          `Error: Unknown systemParam type: ${sysParam.type || "undefined"}.`,
        );
    }
    sdkLines.push("");
  }
  sdkLines.push("}\n");

  const lowerClassName = lowercaseFirstLetter(className);
  // The function that returns the main class
  sdkLines.push(
    `export function ${lowerClassName}(instanceId: string, params: ${className}Params) {`,
  );
  sdkLines.push(`  return new ${className}(instanceId, params);`);
  sdkLines.push("}\n");

  // The main class
  sdkLines.push(`/**`);
  sdkLines.push(` * ${spec.displayName || spec.name}`);
  spec.description?.split("\n").forEach((val: string) => {
    sdkLines.push(` * ${val.replace(/\*\//g, "* /")}`); // don't end the comment
  });
  sdkLines.push(` */`);
  sdkLines.push(`export class ${className} {`);
  if (hasEvents) {
    sdkLines.push(`  events: string[] = [];`);
  }
  if (extensionRef) {
    sdkLines.push(`  readonly FIREBASE_EXTENSION_REFERENCE = "${extensionRef}";`);
    sdkLines.push(`  readonly EXTENSION_VERSION = "${extensionRef.split("@")[1]}";\n`);
  } else if (localPath) {
    sdkLines.push(`  readonly FIREBASE_EXTENSION_LOCAL_PATH = "${localPath}";`);
  }
  sdkLines.push(
    `  constructor(private instanceId: string, private params: ${className}Params) {}\n`,
  );

  // These 2 accessors are more about stopping the compiler from complaining
  // about "declared but never used" variables. (We do use them, it's how
  // we know what to call the instance and what parameters it has when we deploy).
  sdkLines.push(`  getInstanceId(): string { return this.instanceId; }\n`);
  sdkLines.push(`  getParams(): ${className}Params { return this.params; }\n`);

  if (spec.events) {
    const prefix = longestCommonPrefix(spec.events.map((e) => e.type));
    for (const event of spec.events) {
      const eventName = makeEventName(event.type, prefix);
      sdkLines.push("  /**");
      sdkLines.push(`   * ${event.description}`);
      sdkLines.push(`   */`);
      sdkLines.push(
        `  ${eventName}<T = unknown>(callback: EventCallback<T>, options?: SimpleEventarcTriggerOptions) {`,
      );
      sdkLines.push(`    this.events.push("${event.type}");`);
      sdkLines.push(`    return onCustomEventPublished({`);
      sdkLines.push(`        ...options,`);
      sdkLines.push(`        "eventType": "${event.type}",`);
      // The projectId will be filled in during deploy when we know which project we are deploying to.
      sdkLines.push(
        '        "channel": `projects/locations/${this.params._EVENT_ARC_REGION}/channels/firebase`,',
      );
      sdkLines.push('        "region": `${this.params._EVENT_ARC_REGION}`');
      sdkLines.push("    },");
      sdkLines.push("    callback);");
      sdkLines.push(`  }\n`);
    }
  }
  sdkLines.push(`}`); // End of class

  // Write the files
  // shortDirPath so it's easier to read
  const shortDirPath = dirPath.replace(process.cwd(), ".");

  await writeFile(`${dirPath}/index.ts`, sdkLines.join("\n"), options);
  await writeFile(`${dirPath}/package.json`, JSON.stringify(pkgJson, null, 2), options);
  await writeFile(`${dirPath}/tsconfig.json`, JSON.stringify(tsconfigJson, null, 2), options);

  // We don't ask for permissions for the next 2 commands because they only
  // really affect the generated directory and their effects can be negated
  // by just removing that directory.

  // NPM install dependencies (since we will be adding this link locally)
  logLabeledBullet("extensions", `running 'npm --prefix ${shortDirPath} install'`);
  try {
    await spawnWithOutput("npm", ["--prefix", dirPath, "install"]);
  } catch (err: unknown) {
    const errMsg = getErrMsg(err, "unknown error");
    throw new FirebaseError(`Error during npm install in ${shortDirPath}: ${errMsg}`);
  }

  // Build it
  logLabeledBullet("extensions", `running 'npm --prefix ${shortDirPath} run build'`);
  try {
    await spawnWithOutput("npm", ["--prefix", dirPath, "run", "build"]);
  } catch (err: unknown) {
    const errMsg = getErrMsg(err, "unknown error");
    throw new FirebaseError(`Error during npm run build in ${shortDirPath}: ${errMsg}`);
  }

  const codebaseDir = getCodebaseDir(options);
  const shortCodebaseDir = codebaseDir.replace(process.cwd(), ".");
  let installCmd = "";
  if (
    await confirm({
      message: `Do you want to install the SDK with npm now?`,
      nonInteractive: options.nonInteractive,
      force: options.force,
      default: true,
    })
  ) {
    logLabeledBullet(
      "extensions",
      `running 'npm --prefix ${shortCodebaseDir} install --save ${shortDirPath}'`,
    );
    try {
      await spawnWithOutput("npm", ["--prefix", codebaseDir, "install", "--save", dirPath]);
    } catch (err: unknown) {
      const errMsg = getErrMsg(err, "unknown error");
      throw new FirebaseError(`Error during npm install in ${codebaseDir}: ${errMsg}`);
    }
  } else {
    installCmd = `npm --prefix ${shortCodebaseDir} install --save ${shortDirPath}`;
  }

  let sampleImport;
  if (isTypescriptCodebase(codebaseDir)) {
    sampleImport =
      "```typescript\n" + `import { ${lowerClassName} } from "${packageName}";` + "\n```";
  } else {
    sampleImport = "```js\n" + `const { ${lowerClassName} } = require("${packageName}");` + "\n```";
  }
  const prefix = installCmd
    ? `\nTo install the SDK to your project run:\n    ${installCmd}\n\nThen you `
    : "\nYou ";
  const instructions =
    prefix +
    `can add this to your codebase to begin using the SDK:\n\n` +
    fixDarkBlueText(await marked(sampleImport)) +
    `See also: ${fixDarkBlueText(await marked("[Extension SDKs documentation](https://firebase.google.com/docs/extensions/install-extensions?interface=sdk#config)"))}`;

  return instructions;
}
