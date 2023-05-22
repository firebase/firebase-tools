import { CloudEvent } from "./events/types";
import { FirebaseError } from "../error";

const BUILT_IN_ATTRS: string[] = ["time", "datacontenttype", "subject"];

export function cloudEventFromProtoToJson(ce: any): CloudEvent<any> {
  if (ce["id"] === undefined) {
    throw new FirebaseError("CloudEvent 'id' is required.");
  }
  if (ce["type"] === undefined) {
    throw new FirebaseError("CloudEvent 'type' is required.");
  }
  if (ce["specVersion"] === undefined) {
    throw new FirebaseError("CloudEvent 'specVersion' is required.");
  }
  if (ce["source"] === undefined) {
    throw new FirebaseError("CloudEvent 'source' is required.");
  }
  const out: CloudEvent<any> = {
    id: ce["id"],
    type: ce["type"],
    specversion: ce["specVersion"],
    source: ce["source"],
    subject: getOptionalAttribute(ce, "subject", "ceString"),
    time: getRequiredAttribute(ce, "time", "ceTimestamp"),
    data: getData(ce),
    datacontenttype: getRequiredAttribute(ce, "datacontenttype", "ceString"),
  };
  for (const attr in ce["attributes"]) {
    if (BUILT_IN_ATTRS.includes(attr)) {
      continue;
    }
    out[attr] = getRequiredAttribute(ce, attr, "ceString");
  }
  return out;
}

function getOptionalAttribute(ce: any, attr: string, type: string): string | undefined {
  return ce?.["attributes"]?.[attr]?.[type];
}

function getRequiredAttribute(ce: any, attr: string, type: string): string {
  const val = ce?.["attributes"]?.[attr]?.[type];
  if (val === undefined) {
    throw new FirebaseError("CloudEvent must contain " + attr + " attribute");
  }
  return val;
}

function getData(ce: any): any {
  const contentType = getRequiredAttribute(ce, "datacontenttype", "ceString");
  switch (contentType) {
    case "application/json":
      return JSON.parse(ce["textData"]);
    case "text/plain":
      return ce["textData"];
    case undefined:
      return undefined;
    default:
      throw new FirebaseError("Unsupported content type: " + contentType);
  }
}
