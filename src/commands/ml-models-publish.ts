import { Command } from "../command";
import { FirebaseModel } from "../ml/models";

module.exports = new Command("ml:models:publish <modelId>")
  .description("publishes the Firebase ML Model with the given modelId")
  .action(
    async (modelId: string): Promise<FirebaseModel> => {
      throw new Error("Not Implemented");
    }
  );
