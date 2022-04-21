import * as semver from "semver";

import * as extensionsApi from "../../extensions/extensionsApi";
import * as refs from "../../extensions/refs";
import { FirebaseError } from "../../error";
import {
  getFirebaseProjectParams,
  isLocalPath,
  substituteParams,
} from "../../extensions/extensionsHelper";
import { logger } from "../../logger";
import { readInstanceParam } from "../../extensions/manifest";
import { ParamBindingOptions } from "../../extensions/paramHelper";
import { readExtensionYaml, readPostinstall } from "../../extensions/emulator/specHelper";

export interface InstanceSpec {
  instanceId: string;
  // OneOf:
  ref?: refs.Ref; // For published extensions
  localPath?: string; // For local extensions
  // Used by getExtensionVersion, getExtension, and getExtensionSpec.
  // You should stronly prefer accessing via those methods
  extensionVersion?: extensionsApi.ExtensionVersion;
  extension?: extensionsApi.Extension;
  extensionSpec?: extensionsApi.ExtensionSpec;
}

/**
 * Instance spec used by manifest.
 *
 * Params are passed in ParamBindingOptions so we know the param bindings for
 * all environments user has configured.
 *
 * So far this is only used for writing to the manifest, but in the future
 * we want to read manifest into this interface.
 */
export interface ManifestInstanceSpec extends InstanceSpec {
  params: Record<string, ParamBindingOptions>;
}

/**
 * Instance spec used for deploying extensions to firebase project or emulator.
 *
 * Param bindings are expected to be collapsed from ParamBindingOptions into a Record<string, string>.
 */
export interface DeploymentInstanceSpec extends InstanceSpec {
  params: Record<string, string>;
}

/**
 * Caching fetcher for the corresponding ExtensionVersion for an instance spec.
 */
export async function getExtensionVersion(
  i: InstanceSpec
): Promise<extensionsApi.ExtensionVersion> {
  if (!i.extensionVersion) {
    if (!i.ref) {
      throw new FirebaseError(
        `Can't get ExtensionVersion for ${i.instanceId} because it has no ref`
      );
    }
    i.extensionVersion = await extensionsApi.getExtensionVersion(refs.toExtensionVersionRef(i.ref));
  }
  return i.extensionVersion;
}

/**
 * Caching fetcher for the corresponding Extension for an instance spec.
 */
export async function getExtension(i: InstanceSpec): Promise<extensionsApi.Extension> {
  if (!i.ref) {
    throw new FirebaseError(`Can't get Extension for ${i.instanceId} because it has no ref`);
  }
  if (!i.extension) {
    i.extension = await extensionsApi.getExtension(refs.toExtensionRef(i.ref));
  }
  return i.extension;
}

/** Caching fetcher for the corresponding ExtensionSpec for an instance spec.
 */
export async function getExtensionSpec(i: InstanceSpec): Promise<extensionsApi.ExtensionSpec> {
  if (!i.extensionSpec) {
    if (i.ref) {
      const extensionVersion = await getExtensionVersion(i);
      i.extensionSpec = extensionVersion.spec;
    } else if (i.localPath) {
      i.extensionSpec = await readExtensionYaml(i.localPath);
      i.extensionSpec.postinstallContent = await readPostinstall(i.localPath);
    } else {
      throw new FirebaseError("InstanceSpec had no ref or localPath, unable to get extensionSpec");
    }
  }
  return i.extensionSpec;
}

/**
 * have checks a project for what extension instances are currently installed,
 * and returns them as a list of instanceSpecs.
 * @param projectId
 */
export async function have(projectId: string): Promise<DeploymentInstanceSpec[]> {
  const instances = await extensionsApi.listInstances(projectId);
  return instances.map((i) => {
    const dep: DeploymentInstanceSpec = {
      instanceId: i.name.split("/").pop()!,
      params: i.config.params,
    };
    if (i.config.extensionRef) {
      const ref = refs.parse(i.config.extensionRef);
      dep.ref = ref;
      dep.ref.version = i.config.extensionVersion;
    }
    return dep;
  });
}

/**
 * want checks firebase.json and the extensions directory for which extensions
 * the user wants installed on their project.
 * @param projectId The project we are deploying to
 * @param projectNumber The project number we are deploying to. Used for checking .env files.
 * @param aliases An array of aliases for the project we are deploying to. Used for checking .env files.
 * @param projectDir The directory containing firebase.json and extensions/
 * @param extensions The extensions section of firebase.jsonm
 * @param emulatorMode Whether the output will be used by the Extensions emulator.
 *                     If true, this will check {instanceId}.env.local for params and will respect `demo-` project rules.
 */
export async function want(args: {
  projectId: string;
  projectNumber: string;
  aliases: string[];
  projectDir: string;
  extensions: Record<string, string>;
  emulatorMode?: boolean;
}): Promise<DeploymentInstanceSpec[]> {
  const instanceSpecs: DeploymentInstanceSpec[] = [];
  const errors: FirebaseError[] = [];
  for (const e of Object.entries(args.extensions)) {
    try {
      const instanceId = e[0];

      const params = readInstanceParam({
        projectDir: args.projectDir,
        instanceId,
        projectId: args.projectId,
        projectNumber: args.projectNumber,
        aliases: args.aliases,
        checkLocal: args.emulatorMode,
      });
      const autoPopulatedParams = await getFirebaseProjectParams(args.projectId, args.emulatorMode);
      const subbedParams = substituteParams(params, autoPopulatedParams);

      if (isLocalPath(e[1])) {
        instanceSpecs.push({
          instanceId,
          localPath: e[1],
          params: subbedParams,
        });
      } else {
        const ref = refs.parse(e[1]);
        ref.version = await resolveVersion(ref);
        instanceSpecs.push({
          instanceId,
          ref,
          params: subbedParams,
        });
      }
    } catch (err: any) {
      logger.debug(`Got error reading extensions entry ${e}: ${err}`);
      errors.push(err as FirebaseError);
    }
  }
  if (errors.length) {
    const messages = errors.map((err) => `- ${err.message}`).join("\n");
    throw new FirebaseError(`Errors while reading 'extensions' in 'firebase.json'\n${messages}`);
  }
  return instanceSpecs;
}

/**
 * resolveVersion resolves a semver string to the max matching version.
 * Exported for testing.
 * @param publisherId
 * @param extensionId
 * @param version a semver or semver range
 */
export async function resolveVersion(ref: refs.Ref): Promise<string> {
  const extensionRef = refs.toExtensionRef(ref);
  const versions = await extensionsApi.listExtensionVersions(extensionRef);
  if (versions.length === 0) {
    throw new FirebaseError(`No versions found for ${extensionRef}`);
  }
  if (!ref.version || ref.version === "latest") {
    return versions
      .map((ev) => ev.spec.version)
      .sort(semver.compare)
      .pop()!;
  }
  const maxSatisfying = semver.maxSatisfying(
    versions.map((ev) => ev.spec.version),
    ref.version
  );
  if (!maxSatisfying) {
    throw new FirebaseError(
      `No version of ${extensionRef} matches requested version ${ref.version}`
    );
  }
  return maxSatisfying;
}
