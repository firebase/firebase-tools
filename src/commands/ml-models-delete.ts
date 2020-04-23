import * as clc from "cli-color";
import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { requirePermissions } from "../requirePermissions";
import { ensureFirebaseMlApiEnabled, isValidModelId } from "../ml/mlHelper";
import * as mlApi from "../ml/mlApi";
import * as utils from "../utils";

export default new Command("ml:models:delete <modelId>")
  .description("delete the Firebase ML Model with the given modelId")
  .help("TODO")
  .before(requirePermissions, ["firebaseml.models.delete"])
  .before(ensureFirebaseMlApiEnabled)
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (modelId: string, options: any): Promise<void> => {
      if (!isValidModelId(modelId)) {
        return utils.reject("Must specify a valid model ID", { exit: 1 });
      }
      const projectId = getProjectId(options);
      try {
        await mlApi.deleteModel(projectId, modelId);
      } catch (err) {
        if (err.status === 404) {
          return utils.reject(`No model ${modelId} in project ${projectId}.`, {
            exit: 1,
          });
        }
        throw err;
      }
      utils.logSuccess(`Deleted Model ${clc.bold(modelId)}`);
    }
  );
