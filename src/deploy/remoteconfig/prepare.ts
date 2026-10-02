import { needProjectNumber } from "../../projectUtils";
import { loadCJSON } from "../../loadCJSON";
import { getEtag } from "./functions";
import { validateInputRemoteConfigTemplate } from "./functions";
import { DeployOptions } from "../";
import { FirebaseError } from "../../error";

export default async function (context: any, options: DeployOptions): Promise<void> {
  if (!context) {
    return;
  }
  const onlyTargets = options.only?.split(",") ?? [];
  const isServer = onlyTargets.includes("remoteconfig:server");
  const isClient = onlyTargets.includes("remoteconfig") || !options.only;

  if (isServer && isClient) {
    throw new FirebaseError(
      "Cannot deploy both Remote Config client and server templates in the same command.",
    );
  }

  let filePath: string | undefined;
  let templateType: string | undefined;

  if (isServer) {
    filePath = options.config.src.remoteconfig?.server?.template;
    templateType = "firebase-server";
    if (!filePath) {
      throw new FirebaseError(
        "No server template found in firebase.json. Please configure `remoteconfig.server.template`.",
      );
    }
  } else {
    filePath = options.config.src.remoteconfig?.template;
    if (!filePath) {
      return;
    }
  }

  const template = loadCJSON(filePath);
  const projectNumber = await needProjectNumber(options);
  template.etag = await getEtag(projectNumber, undefined, templateType);
  validateInputRemoteConfigTemplate(template);
  context.remoteconfigTemplate = template;
  context.remoteconfigTemplateType = templateType;
  return;
}
