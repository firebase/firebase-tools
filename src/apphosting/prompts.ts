import { select, confirm } from "../prompt";

export const DEFAULT_RUNTIME = "nodejs";

export async function promptRuntime(): Promise<string> {
  return await select({
    message: "Which runtime do you want to use?",
    choices: [
      { name: "Node.js (default)", value: DEFAULT_RUNTIME },
      { name: "Node.js 22", value: "nodejs22" },
    ],
    default: DEFAULT_RUNTIME,
  });
}

export async function promptAutomaticBaseImageUpdates(): Promise<boolean> {
  return await confirm({
    message: "Would you like to enable Automatic Base Image Updates (ABIU)?",
    default: true,
  });
}
