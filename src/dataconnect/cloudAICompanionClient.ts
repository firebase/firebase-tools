import { ClientResponse, Client } from "../apiv2";
import { cloudAiCompanionOrigin } from "../api";
import {
  CloudAICompanionResponse,
  CloudAICompanionRequest,
  CloudAICompanionInput,
  ClientContext,
  CallCloudAiCompanionRequest,
} from "./types";

const CLOUD_AI_COMPANION_VERSION = "v1";
const CLIENT_CONTEXT_NAME_IDENTIFIER = "firebase_vscode";
const FIREBASE_CHAT_REQUEST_CONTEXT_TYPE_NAME =
  "type.googleapis.com/google.cloud.cloudaicompanion.v1main.FirebaseChatRequestContext";
const FDC_SCHEMA_EXPERIENCE_CONTEXT = "/appeco/firebase/fdc-schema-generator";
const FDC_OPERATION_EXPERIENCE_CONTEXT = "/appeco/firebase/fdc-query-generator";
const USER_AUTHOR = "USER";
type GENERATION_TYPE = "schema" | "operation";

export function cloudAICompationClient(): Client {
  return new Client({
    urlPrefix: cloudAiCompanionOrigin(),
    apiVersion: CLOUD_AI_COMPANION_VERSION,
    auth: true,
  });
}

export async function callCloudAICompanion(
  client: Client,
  vscodeRequest: CallCloudAiCompanionRequest,
  type: GENERATION_TYPE,
): Promise<ClientResponse<CloudAICompanionResponse>> {
  const request = buildRequest(vscodeRequest, type);
  const { projectId } = getServiceParts(vscodeRequest.servicePath);

  const instance = toChatResourceName(projectId);
  const res = await client.post<CloudAICompanionRequest, CloudAICompanionResponse>(
    `${instance}:completeTask`,
    request,
  );
  return res;
}

function buildRequest(
  { servicePath, naturalLanguageQuery, chatHistory }: CallCloudAiCompanionRequest,
  type: GENERATION_TYPE,
): CloudAICompanionRequest {
  const { serviceId } = getServiceParts(servicePath);
  const input: CloudAICompanionInput = {
    messages: [
      ...chatHistory,
      {
        author: USER_AUTHOR,
        content: naturalLanguageQuery,
      },
    ],
  };

  const clientContext: ClientContext = {
    name: CLIENT_CONTEXT_NAME_IDENTIFIER,
    // TODO: determine if we should pass vscode version; // version: ideContext.ver,
    additionalContext: {
      "@type": FIREBASE_CHAT_REQUEST_CONTEXT_TYPE_NAME,
      fdcInfo: {
        serviceId,
        fdcServiceName: servicePath,
        requiresQuery: true,
      },
    },
  };

  return {
    input,
    clientContext,
    experienceContext: {
      experience:
        type === "schema" ? FDC_SCHEMA_EXPERIENCE_CONTEXT : FDC_OPERATION_EXPERIENCE_CONTEXT,
    },
  };
}

function toChatResourceName(projectId: string): string {
  return `projects/${projectId}/locations/global/instances/default`;
}

/** Gets service name parts */
interface ServiceParts {
  projectId: string;
  locationId: string;
  serviceId: string;
}
function getServiceParts(name: string): ServiceParts {
  const match = name.match(/projects\/([^/]*)\/locations\/([^/]*)\/services\/([^/]*)/);

  if (!match) {
    throw new Error(`Invalid service name: ${name}`);
  }

  return { projectId: match[1], locationId: match[2], serviceId: match[3] };
}
