import { Command } from "../command";
import {FirebaseModel} from "../ml/models";

module.exports = new Command("ml:models:unpublish <modelId>")
  .description(
    "unpublishes the Firebase ML Model with the given modelId"
  )
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (modelId: string): Promise<FirebaseModel> => {
      throw new Error('Not Implemented');
    }
  );
