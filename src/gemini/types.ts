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

/** New types for Orcas Agent */
export type Role = 'USER' | 'MODEL';

export interface TextChunk {
  text: string;
}

export interface CodeChunk {
  code: string;
  languageCode?: string;
}

export interface Part {
  textChunk?: TextChunk;
  codeChunk?: CodeChunk;
}

export interface ChatMessage {
  role: Role;
  parts: Part[];
}

export interface GenerationStatus {
  state: 'STATE_UNSPECIFIED' | 'ANALYZING_SCHEMA' | 'GENERATING_LOGIC' | 'COMPLETED';
  message?: string;
}

export interface GenerateResponse {
  status?: GenerationStatus;
  part?: Part;
}
