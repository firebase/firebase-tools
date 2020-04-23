import * as clc from "cli-color";
import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { requirePermissions } from "../requirePermissions";
import { ensureFirebaseMlApiEnabled, isValidModelId } from "../ml/mlHelper";
import * as mlApi from "../ml/mlApi";
import * as utils from "../utils";
import { FirebaseError } from "../error";

export default new Command("ml:models:delete <modelId>")
  .description("delete the Firebase ML Model with the given modelId")
  .help("TODO")
  .before(requirePermissions, ["firebaseml.models.delete"])
  .before(ensureFirebaseMlApiEnabled)
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (modelId: string, options: any): Promise<void> => {
      if (!isValidModelId(modelId)) {
        throw new FirebaseError("Must specify a valid model ID");
      }
      const projectId = getProjectId(options);
      try {
        await mlApi.deleteModel(projectId, modelId);
      } catch (err) {
        if (err.status === 404) {
          return utils.reject(`No model ${modelId} in project ${projectId}.`);
        }
        throw err;
      }
      utils.logLabeledSuccess("ml", `Deleted Model ${clc.bold(modelId)}`);
    }
  );
