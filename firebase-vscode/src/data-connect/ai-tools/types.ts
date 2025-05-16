import { ChatMessage } from "../../dataconnect/cloudAICompanionTypes";

export enum Command {
  GENERATE_SCHEMA = "generate_schema",
  GENERATE_OPERATION = "generate_operation",
}
export enum Context {
  REFINE_SCHEMA = "refine_schema",
  REFINE_OPERATION = "refine_op",
  NO_OP = "no_op", // not no_operation, it's just a no-op
}
// export type CommandContext = Command | Context;
export const CommandContext = { ...Command, ...Context };
export type CommandContextType = Command | Context;

// adds context to the ChatMessage type for reasoning
export interface Chat extends ChatMessage {
  commandContext?: CommandContextType;
}

// represents a backend chat response
export const BackendAuthor = {
  MODEL: "MODEL", // schema api
  SYSTEM: "SYSTEM", // operation api
};
