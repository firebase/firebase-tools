import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { pickService } from "../dataconnect/fileUtils";
import { FirebaseError } from "../error";
import { migrateSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";
import { requirePermissions } from "../requirePermissions";
import { ensureApis } from "../dataconnect/ensureApis";
import { logLabeledSuccess } from "../utils";

export const command = new Command("dataconnect:sql:setup [serviceId]")
  .description("Setup your CloudSQL database")
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
    "cloudsql.instances.connect",
  ])
  .before(requireAuth)
  .action(async (serviceId: string, options: Options) => {
    const projectId = needProjectId(options);
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId);
    const instanceId =
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.cloudSql.instanceId;
    if (!instanceId) {
      throw new FirebaseError(
        "dataconnect.yaml is missing field schema.datasource.postgresql.cloudsql.instanceId",
      );
    }

    // TODO: brownfield / greenfield prompt sequences
  });
