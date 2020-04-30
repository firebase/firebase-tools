import * as clc from "cli-color";
import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { FirebaseModel } from "../ml/models";
import { requirePermissions } from "../requirePermissions";
import { ensureFirebaseMlApiEnabled, isValidModelId, getTableForModel } from "../ml/mlHelper";
import * as mlApi from "../ml/mlApi";
import { FirebaseError } from "../error";
import * as logger from "../logger";
import * as utils from "../utils";

export default new Command("ml:models:get <modelId>")
  .description("get the Firebase ML Model with the given modelId")
  .help("TODO")
  .before(requirePermissions, ["firebaseml.models.get"])
  .before(ensureFirebaseMlApiEnabled)
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (modelId: string, options: any): Promise<FirebaseModel> => {
      if (!isValidModelId(modelId)) {
        throw new FirebaseError("Must specify a valid model ID");
      }

      const projectId = getProjectId(options);
      let model: FirebaseModel;
      try {
        model = await mlApi.getModel(projectId, modelId);
      } catch (err) {
        if (err.status === 404) {
          throw new FirebaseError(`No model ${modelId} in project ${projectId}.`, options);
        }
        throw err;
      }

      if (model.state?.validationError) {
        logger.info();
        utils.logWarning(
          clc.bold.red(
            `Model ${modelId} has validation error: ${model.state.validationError.message}`
          )
        );
        logger.info();
        logger.info("To update this model with a valid source run:");
        logger.info("$ firebase ", `ml:models:update ${modelId} --source <your_source>`);
      }

      const table = getTableForModel(model);

      logger.info();
      logger.info(table.toString());
      logger.info();
      logger.info("View your model in the firebase console:");
      logger.info();
      logger.info(`    https://console.firebase.google.com/project/${projectId}/ml/custom\n`);

      return model;
    }
  );
