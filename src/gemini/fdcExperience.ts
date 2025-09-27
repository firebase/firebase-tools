import { Client } from "../apiv2";
import { cloudAiCompanionOrigin } from "../api";
import {
  ChatExperienceResponse,
  CloudAICompanionMessage,
  CloudAICompanionRequest,
  GenerateOperationResponse,
  GenerateSchemaResponse,
} from "./types";
import { FirebaseError } from "../error";

const apiClient = new Client({ urlPrefix: cloudAiCompanionOrigin(), auth: true });
const SCHEMA_GENERATOR_EXPERIENCE = "/appeco/firebase/fdc-schema-generator";
const GEMINI_IN_FIREBASE_EXPERIENCE = "/appeco/firebase/firebase-chat/free";
const OPERATION_GENERATION_EXPERIENCE = "/appeco/firebase/fdc-query-generator";
const FIREBASE_CHAT_REQUEST_CONTEXT_TYPE_NAME =
  "type.googleapis.com/google.cloud.cloudaicompanion.v1main.FirebaseChatRequestContext";

export const PROMPT_GENERATE_CONNECTOR =
  "Create 4 operations for an app using the instance schema with proper authentication.";

export const PROMPT_GENERATE_SEED_DATA =
  "Create a mutation to populate the database with some seed data.";

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
  return extractCodeBlock(res.body.output.messages[0].content);
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
  console.log("generateOperation called", prompt, service, project, chatHistory);
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
  return extractCodeBlock(res.body.output.messages[0].content);
}

/**
 * extractCodeBlock extracts the code block from the generated response.
 * @param text the generated response from the service.
 * @return the code block from the generated response.
 */
export function extractCodeBlock(text: string): string {
  const regex = /```(?:[a-z]+\n)?([\s\S]*?)```/m;
  const match = text.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  throw new FirebaseError(`No code block found in the generated response: ${text}`);
}
