import { Command } from "../command";

module.exports = new Command("ml:models:delete <modelId>")
  .description("deletes the Firebase ML Model with the given modelId")
  .action(
    async (modelId: string): Promise<void> => {
      throw new Error("Not Implemented");
    }
  );
