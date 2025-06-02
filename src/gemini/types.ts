export interface CloudAICompanionMessage {
  content: string;
  author: string;
}

export interface CloudAICompanionInput {
  preamble?: string;
  messages: CloudAICompanionMessage[];
}

export interface ExperienceContext {
  experience?: string;
  agent?: string;
  task?: string;
}

export interface FdcRequestInfo {
  serviceId?: string;
  fdcServiceName: string;
  requiresQuery: boolean;
}

export interface ClientContext {
  name?: string;
  additionalContext: {
    "@type": string;
    fdcInfo: FdcRequestInfo;
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
}

/** Experience specific response types */

export interface GenerateOperationResponse {
  output: { messages: CloudAICompanionMessage[] };
  outputDataContext: { additionalcontext: { "@type:": string } };
}

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
  output: { messages: CloudAICompanionMessage[] };
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
