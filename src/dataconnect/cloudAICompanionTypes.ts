import { FirebaseError } from "../error";

export interface CallCloudAiCompanionRequest {
  servicePath: string;
  naturalLanguageQuery: string;
  chatHistory: ChatMessage[];
}

export interface CloudAICompanionInput {
  preamble?: string;
  messages: CloudAICompanionMessage[];
}

export interface CloudAICompanionMessage {
  content: string;
  author: string;
}

export interface ExperienceContext {
  experience?: string;
  agent?: string;
  task?: string;
}
export interface ClientContext {
  name: string;
  additionalContext: {
    "@type": string;
    fdcInfo: {
      serviceId: string;
      fdcServiceName: string;
      requiresQuery: boolean;
    };
  };
}

export interface CloudAICompanionRequest {
  messageId?: string;
  topic?: string;
  input: CloudAICompanionInput;

  // product context -- required
  experienceContext: ExperienceContext;

  // Client context (e.g. IDE name, version, etc)
  clientContext?: ClientContext;

  // Unused
  // // The GCP resources that the code generation process needs to reference
  // backendResourcesContext?: BackendResourcesContext;

  // // Additional user content not captured in the `input` field above
  // inputDataContext?: InputDataContext;
}

export interface CloudAICompanionResponse {
  output: {
    messages: ChatMessage[];
  };
  error?: FirebaseError;
}

export interface FdcRequestInfo {
  serviceId: string;
  fdcServiceName: string;
  requiresQuery: boolean;
}

export interface ChatMessage {
  content: string;
  author: string;
}
