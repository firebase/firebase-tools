import { Schema } from "../dataconnect/types";
export { Schema };

export type Role = "USER" | "MODEL";

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
  state: "STATE_UNSPECIFIED" | "ANALYZING_SCHEMA" | "GENERATING_LOGIC" | "COMPLETED";
  message?: string;
}

export interface GenerateResponse {
  status?: GenerationStatus;
  part?: Part;
}

export interface GenerateSchemaRequest {
  name: string;
  prompt: string;
}

export interface GenerateOperationRequest {
  name: string;
  prompt: string;
  schemas?: Schema[];
}

export type GenerateRequest = GenerateSchemaRequest | GenerateOperationRequest;
