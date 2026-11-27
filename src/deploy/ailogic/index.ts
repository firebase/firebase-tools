import { prepare } from "./prepare";
import { release } from "./release";

/**
 * No-op: all reads, planning, validation, and the prune confirmation happen in
 * prepare, and the writes happen in release, so nothing mutates until every
 * target's prepare (and every confirmation) has passed.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function
async function deploy(): Promise<void> {}

export { prepare, deploy, release };

export const help =
  "Deploys AI Logic server prompt templates defined in your project's firebase.json.";
export const detailedHelp =
  "AI Logic deploys the .prompt files in your prompts directory as server prompt templates: " +
  "new files are created, changed files are updated, unchanged files are skipped, and " +
  "templates whose files were removed are deleted after confirmation.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "ailogic": {\n' +
  '    "templates": "prompts"\n' +
  "  }\n" +
  "}";
