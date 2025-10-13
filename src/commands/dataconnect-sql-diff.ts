import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { ensureApis } from "../dataconnect/ensureApis";
import { requirePermissions } from "../requirePermissions";
import { pickService } from "../dataconnect/load";
import { diffSchema } from "../dataconnect/schemaMigration";
import { requireAuth } from "../requireAuth";

export const command = new Command("dataconnect:sql:diff")
  .description(
    "display the differences between a local Data Connect schema and your CloudSQL database's current schema",
  )
  .option("--service <serviceId>", "the serviceId of the Data Connect service")
  .option("--location <location>", "the location of the Data Connect service", "us-central1")
  .before(requirePermissions, [
    "firebasedataconnect.services.list",
    "firebasedataconnect.schemas.list",
    "firebasedataconnect.schemas.update",
  ])
  .before(requireAuth)
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    if (!options.service) {
      throw new FirebaseError("Missing required flag --service");
    }
    const serviceId = options.service as string;
    const location = options.location as string;
    await ensureApis(projectId);
    const serviceInfo = await pickService(projectId, options.config, serviceId, location);

    const diffs = await diffSchema(
      options,
      serviceInfo.schema,
      serviceInfo.dataConnectYaml.schema.datasource.postgresql?.schemaValidation,
    );
    return { projectId, serviceId, diffs };
  });
