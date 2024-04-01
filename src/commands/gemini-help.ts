import { Command } from "../command";
import * as gemini from "../gemini";

export const command = new Command("gemini:help [prompt]")
  .description("Ask gemini a question about how to use firebase-tools")
  .action(async (prompt: string) => {
    await gemini.ask(prompt);
  });
