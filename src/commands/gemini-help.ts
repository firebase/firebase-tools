import { Command } from "../command";
import * as gemini from "../gemini";
import { logger } from "../logger";

export const command = new Command("gemini:help [prompt]")
  .description("Ask gemini a question about how to use firebase-tools")
  .action(async (prompt: string) => {
    logger.info(
        "  some log ok1"
      );
    await gemini.ask(prompt);
  });
