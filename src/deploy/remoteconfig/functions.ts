const rcGet = require("../../remoteconfig/get");
import { RemoteConfigTemplate } from "../../remoteconfig/interfaces";

export async function createEtag(projectId: string): Promise<string> {
  const template = await rcGet.getTemplate(projectId);
  const etag = "etag-" + projectId + "-" + template?.version?.versionNumber;
  return etag;
}

export function validateInputRemoteConfigTemplate(
  template: RemoteConfigTemplate
): RemoteConfigTemplate {
  const templateCopy = JSON.parse(JSON.stringify(template)); // Deep copy
  if (!templateCopy || templateCopy == "null" || templateCopy == "undefined") {
    throw new Error(
      // "invalid-argument",
      `Invalid Remote Config template: ${JSON.stringify(templateCopy)}`
    );
  }
  if (typeof templateCopy.etag !== "string" || templateCopy.etag == "") {
    throw new Error(
      // "invalid-argument",
      "ETag must be a non-empty string."
    );
  }
  if (
    !templateCopy.parameters ||
    templateCopy.parameters == "null" ||
    templateCopy.parameters == "undefined"
  ) {
    throw new Error(
      // "invalid-argument",
      "Remote Config parameters must be a non-null object"
    );
  }
  if (
    !templateCopy.parameterGroups ||
    templateCopy.parameterGroups == "null" ||
    templateCopy.parameterGroups == "undefined"
  ) {
    throw new Error(
      // "invalid-argument",
      "Remote Config parameter groups must be a non-null object"
    );
  }
  if (!Array.isArray(templateCopy.conditions)) {
    throw new Error(
      // "invalid-argument",
      "Remote Config conditions must be an array"
    );
  }
  if (typeof templateCopy.version !== "undefined") {
    // exclude output only properties and keep the only input property: description
    templateCopy.version = { description: templateCopy.version.description };
  }
  return templateCopy;
}
