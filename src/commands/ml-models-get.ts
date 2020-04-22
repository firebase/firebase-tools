import { Command } from "../command";
import { FirebaseModel } from "../ml/models";

export default new Command("ml:models:get <modelId>")
  .description("gets the Firebase ML Model with the given modelId")
  .action(
    async (modelId: string): Promise<FirebaseModel> => {
      throw new Error("Not Implemented");
    }
  );
