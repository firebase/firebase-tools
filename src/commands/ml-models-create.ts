import { Command } from "../command";
import { FirebaseModel } from "../ml/models";

module.exports = new Command("ml:models:create <displayName> [source]")
  .description(
    "creates a new Firebase ML Model with the given displayName. " +
      "If present source must be either a reference to an AutoML model, or a tflite file stored in a gcs bucket."
  )
  .option(
    "-t, --tags <tag1,tag2>",
    "(optional) one or more comma separated tags to add to the model"
  )
  .action(
    async (
      displayName: string,
      source: string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options: any
    ): Promise<FirebaseModel> => {
      throw new Error("Not Implemented");
    }
  );
