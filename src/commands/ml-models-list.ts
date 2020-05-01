import * as clc from "cli-color";
import { Command } from "../command";
import * as getProjectId from "../getProjectId";
import { FirebaseModel, ModelsPage } from "../ml/models";
import { requirePermissions } from "../requirePermissions";
import { ensureFirebaseMlApiEnabled, getTableForModelList } from "../ml/mlHelper";
import * as mlApi from "../ml/mlApi";
import * as logger from "../logger";
import * as utils from "../utils";
import { logPrefix } from "../ml/mlHelper";

export default new Command("ml:models:list")
  .description("list all the Firebase ML Models in the current project.")
  .help("TODO")
  .option("-f --filter <filterString>", "(optional) A valid filterString.")
  .before(requirePermissions, ["firebaseml.models.list"])
  .before(ensureFirebaseMlApiEnabled)
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (options: any): Promise<ModelsPage> => {
      const projectId = getProjectId(options);
      const models: FirebaseModel[] = await mlApi.listModels(projectId, options);

      if (models.length < 1) {
        if (options.filter) {
          utils.logLabeledBullet(
            logPrefix,
            `There are no models matching the specified filter in project ${clc.bold(projectId)}`
          );
        } else {
          utils.logLabeledBullet(
            logPrefix,
            `There are no models in project ${clc.bold(projectId)}`
          );
        }
        return { models: [] };
      }

      logger.info();
      logger.info(`Showing ${models.length} models for project ${projectId}`);
      logger.info("For detailed status on a model, run ml:models:get <modelId>");
      logger.info();

      const table = getTableForModelList(models);
      logger.info(table.toString());

      return { models };
    }
  );
