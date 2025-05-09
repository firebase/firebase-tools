import { Client } from "../apiv2";
import { cloudCompanionOrigin } from "../api";

const apiClient = new Client({ urlPrefix: cloudCompanionOrigin(), auth: true });
const schemaGeneratorExperience = "/appeco/firebase/fdc-schema-generator";
const geminiInFirebaseChatExperience = "/appeco/firebase/firebase-chat/free";
const operationGeneratorExperience = "/appeco/firebase/fdc-query-generator";

export interface GenerateSchemaRequest {
  input: { messages: { content: string; author: string }[] };
  experienceContext: { experience: string };
}

export type ChatExperienceRequest = GenerateSchemaRequest;

export interface GenerateSchemaResponse {
  output: { messages: { content: string }[] };
  displayContext: {
    additionalContext: {
      "@type": string;
      firebaseFdcDisplayContext: { schemaSyntaxError: string };
    };
  };
}

export interface ChatExperienceResponse {
  output: { messages: { content: string; author: string }[] };
  outputDataContext: {
    additionalContext: { "@type": string };
    attributionContext: {
      citationMetadata: {
        citations: {
          startIndex: number;
          endIndex: number;
          url: string;
          title: string;
          license: string;
        }[];
      };
    };
  };
}

export interface GenerateOperationRequest {
  input: { messages: { content: string; author: string }[] };
  experienceContext: { experience: string };
  clientContext: {
    additionalContext: {
      "@type": string;
      fdcInfo: { fdcServiceName: string; requiresQuery: boolean };
    };
  };
}

export interface GenerateOperationResponse {
  output: { messages: { content: string; author: string }[] };
  outputDataContext: { additionalcontext: { "@type:": string } };
}

/**
 * generateSchema generates a schema based on the users app design prompt.
 * @param prompt description of the app the user would like to generate.
 * @param project project identifier.
 * @return graphQL schema for a Firebase Data Connect Project.
 */
export async function generateSchema(prompt: string, project: string): Promise<string> {
  const res = await apiClient.post<GenerateSchemaRequest, GenerateSchemaResponse>(
    `/v1beta/projects/${project}/locations/global/instances/default:completeTask`,
    {
      input: { messages: [{ content: prompt, author: "USER" }] },
      experienceContext: {
        experience: schemaGeneratorExperience,
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
): Promise<ChatExperienceResponse> {
  const res = await apiClient.post<ChatExperienceRequest, ChatExperienceResponse>(
    `/v1beta/projects/${project}/locations/global/instances/default:completeTask`,
    {
      input: { messages: [{ content: prompt, author: "USER" }] },
      experienceContext: {
        experience: geminiInFirebaseChatExperience,
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
): Promise<string> {
  const res = await apiClient.post<GenerateOperationRequest, GenerateOperationResponse>(
    `/v1beta/projects/${project}/locations/global/instances/default:completeTask`,
    {
      input: { messages: [{ content: prompt, author: "USER" }] },
      experienceContext: {
        experience: operationGeneratorExperience,
      },
      clientContext: {
        additionalContext: {
          "@type":
            "type.googleapis.com/google.cloud.cloudaicompanion.v1main.FirebaseChatRequestContext",
          fdcInfo: { fdcServiceName: service, requiresQuery: true },
        },
      },
    },
  );
  return res.body.output.messages[0].content;
}
