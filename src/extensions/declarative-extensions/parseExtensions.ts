import { Config } from "../../config";
import { logger } from "../../logger";
import { ExtensionSpec, ExtensionVersion, getExtensionVersion } from "../extensionsApi";
import * as download from "../../emulator/download";

export type ExtensionDeclaration = {
  ref: string;
  params: Record<string, string>;
};

export type EmulatableExtension = {
  spec: ExtensionSpec;
  instanceId: string;
  sourceCodePath: string;
  params: Record<string, string>;
};

export async function readExtensionsConfig(config: Config): Promise<EmulatableExtension[]> {
  if (!config.has("extensions")) {
    logger.debug("No extensions detected in firebase.json");
    return [];
  }
  const extensions = config.get("extensions") as Record<string, unknown>;
  const emulatableExtensions = [];
  for (const [instanceId, dec] of Object.entries(extensions)) {
    const declaration = dec as ExtensionDeclaration;
    let extVersion: ExtensionVersion;
    try {
      extVersion = await getExtensionVersion(declaration.ref);
    } catch (err) {
      console.log(err);
      throw err;
    }
    const unzippedSourceCodePath = await download.downloadExtensionVersion(
      extVersion.ref,
      extVersion.sourceDownloadUri
    );
    emulatableExtensions.push({
      spec: extVersion.spec,
      instanceId,
      params: declaration.params,
      sourceCodePath: unzippedSourceCodePath,
    });
  }
  return emulatableExtensions;
  // Todo: emulate all extensions, not just the first one
}
