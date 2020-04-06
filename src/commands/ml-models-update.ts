import { Command } from "../command";
import { FirebaseModel } from "../ml/models";

module.exports = new Command("ml:models:update <modelId>")
  .description(
    "updates the Firebase ML Model with the given modelId. At least one option must be specified."
  )
  .option("-n --displayName <displayName>", "(optional) the new displayName for this model.")
  .option(
    "-t, --tags <tag1,tag2,...>",
    "(optional) one or more comma separated tags. These replace existing tags."
  )
  .option(
    "-s, --source <modelSource>",
    "(optional) the new modelSource for the model. Replaces the old source. Must be either a reference to an AutoML model, or a TFLite File stored in a GCS bucket."
  )
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (modelId: string, options: any): Promise<FirebaseModel> => {
      throw new Error("Not Implemented");
    }
  );
