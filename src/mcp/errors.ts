import { mcpError } from "./util";

export const NO_PROJECT_ERROR = mcpError(
  "No active project was found. Use the `set_firebase_directory` command to set the project directory (containing firebase.json).",
  "PRECONDITION_FAILED",
);
