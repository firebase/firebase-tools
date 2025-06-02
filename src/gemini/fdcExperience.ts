import { Client } from "../apiv2";
import { cloudCompanionOrigin } from "../api";
import {
  ChatExperienceResponse,
  CloudAICompanionMessage,
  CloudAICompanionRequest,
  GenerateOperationResponse,
  GenerateSchemaResponse,
} from "./types";

const apiClient = new Client({ urlPrefix: cloudCompanionOrigin(), auth: true });
const SCHEMA_GENERATOR_EXPERIENCE = "/appeco/firebase/fdc-schema-generator";
const GEMINI_IN_FIREBASE_EXPERIENCE = "/appeco/firebase/firebase-chat/free";
const OPERATION_GENERATION_EXPERIENCE = "/appeco/firebase/fdc-query-generator";
const FIREBASE_CHAT_REQUEST_CONTEXT_TYPE_NAME =
  "type.googleapis.com/google.cloud.cloudaicompanion.v1main.FirebaseChatRequestContext";

/**
 * generateSchema generates a schema based on the users app design prompt.
 * @param prompt description of the app the user would like to generate.
 * @param project project identifier.
 * @return graphQL schema for a Firebase Data Connect Project.
 */
export async function generateSchema(
  prompt: string,
  project: string,
  chatHistory: CloudAICompanionMessage[] = [],
): Promise<string> {
  const res = await apiClient.post<CloudAICompanionRequest, GenerateSchemaResponse>(
    `/v1beta/projects/${project}/locations/global/instances/default:completeTask`,
    {
      input: { messages: [...chatHistory, { content: prompt, author: "USER" }] },
      experienceContext: {
        experience: SCHEMA_GENERATOR_EXPERIENCE,
      },
    },
  );
  return res.body.output.messages[0].content;
}

/**
 * chatWithFirebase interacts with the Gemini in Firebase integration providing deeper knowledge on Firebase.
 * @param prompt the interaction that the user would like to have with the service.
 * @param project project identifier.
 * @return ChatExperienceResponse includes not only the message from the service but also links to the resources used by the service.
 */
export async function chatWithFirebase(
  prompt: string,
  project: string,
  chatHistory: CloudAICompanionMessage[] = [],
): Promise<ChatExperienceResponse> {
  const res = await apiClient.post<CloudAICompanionRequest, ChatExperienceResponse>(
    `/v1beta/projects/${project}/locations/global/instances/default:completeTask`,
    {
      input: { messages: [...chatHistory, { content: prompt, author: "USER" }] },
      experienceContext: {
        experience: GEMINI_IN_FIREBASE_EXPERIENCE,
      },
    },
  );
  return res.body;
}

/**
 * generateOperation generates an operation based on the users prompt and deployed Firebase Data Connect Service.
 * @param prompt description of the operation the user would like to generate.
 * @param service the name or service id of the deployed Firebase Data Connect service.
 * @param project project identifier.
 * @return graphQL operation for a deployed Firebase Data Connect Schema.
 */
export async function generateOperation(
  prompt: string,
  service: string,
  project: string,
  chatHistory: CloudAICompanionMessage[] = [],
): Promise<string> {
  const res = await apiClient.post<CloudAICompanionRequest, GenerateOperationResponse>(
    `/v1beta/projects/${project}/locations/global/instances/default:completeTask`,
    {
      input: { messages: [...chatHistory, { content: prompt, author: "USER" }] },
      experienceContext: {
        experience: OPERATION_GENERATION_EXPERIENCE,
      },
      clientContext: {
        additionalContext: {
          "@type": FIREBASE_CHAT_REQUEST_CONTEXT_TYPE_NAME,
          fdcInfo: { fdcServiceName: service, requiresQuery: true },
        },
      },
    },
  );
  return res.body.output.messages[0].content;
}
