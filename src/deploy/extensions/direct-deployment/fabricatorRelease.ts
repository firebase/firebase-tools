import { Context as ExtContext, Payload as ExtPayload } from "../args";
import { Options } from "../../../options";
import { needProjectId, needProjectNumber } from "../../../projectUtils";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import { getExtensionSpec } from "../planner";
import { convertExtensionToFunctionEndpoints } from "./extensionToFunctions";
import { createExtensionSources } from "./extensionSourceHandler";
import { Fabricator } from "../../functions/release/fabricator";
import { QueueExecutor } from "../../functions/release/executor";
import * as backend from "../../functions/backend";
import * as planner from "../../functions/release/planner";
import * as args from "../../functions/args";

/**
 * Direct deployment of extensions using the function Fabricator instead of Extensions API.
 * This converts extension instances to function endpoints and uses the function deployment 
 * machinery to deploy them directly to Cloud Functions.
 */
export async function releaseFabricator(
  context: ExtContext,
  options: Options,
  payload: ExtPayload
): Promise<void> {
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);
  
  logger.info("🧪 Using experimental direct deployment via Cloud Functions API");

  // For now, only support updates and configurations, not creation or deletion
  if (payload.instancesToCreate && payload.instancesToCreate.length > 0) {
    throw new FirebaseError(
      "Creating new extensions via direct deployment is not yet supported. " +
      "Please create extensions using the traditional flow first."
    );
  }
  
  if (payload.instancesToDelete && payload.instancesToDelete.length > 0) {
    throw new FirebaseError(
      "Deleting extensions via direct deployment is not yet supported. " +
      "Please use the traditional extension deployment for deletions."
    );
  }

  // Collect instances to process
  const instancesToProcess = [
    ...(payload.instancesToUpdate || []),
    ...(payload.instancesToConfigure || [])
  ];

  if (instancesToProcess.length === 0) {
    logger.debug("No extension instances to process via direct deployment");
    return;
  }

  logger.info(`Converting ${instancesToProcess.length} extension instances to function endpoints`);

  // Convert extension instances to backend endpoints
  const wantBackends: Record<string, backend.Backend> = {};
  
  for (const instance of instancesToProcess) {
    try {
      // Load extension spec
      const extensionSpec = await getExtensionSpec(instance);
      
      // Convert to function endpoints
      const endpoints = await convertExtensionToFunctionEndpoints(
        projectId,
        instance,
        extensionSpec
      );
      
      if (endpoints.length === 0) {
        logger.debug(`Extension ${instance.instanceId} has no functions, skipping`);
        continue;
      }
      
      // Create backend for this instance
      const instanceBackend = backend.of(...endpoints);
      
      // Use a codebase ID that matches our extension naming convention
      const codebaseId = `ext-${instance.instanceId}`;
      wantBackends[codebaseId] = instanceBackend;
      
      logger.debug(`Extension ${instance.instanceId} converted to ${endpoints.length} function endpoints`);
      
    } catch (error) {
      throw new FirebaseError(
        `Failed to convert extension ${instance.instanceId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (Object.keys(wantBackends).length === 0) {
    logger.debug("No function endpoints to deploy");
    return;
  }

  // Get existing backends (what's currently deployed)
  logger.debug("Discovering existing function state...");
  const haveBackend = await backend.existingBackend({ projectId } as args.Context);
  
  // Filter to only extension functions for the instances we're deploying
  const extensionFunctionIds = Object.values(wantBackends)
    .flatMap(b => backend.allEndpoints(b))
    .map(e => e.id);
  
  const haveBackends: Record<string, backend.Backend> = {};
  for (const [codebaseId] of Object.entries(wantBackends)) {
    // Filter existing backend to only include functions for this extension instance
    const codebaseEndpoints = backend.allEndpoints(haveBackend)
      .filter(e => e.codebase === codebaseId || extensionFunctionIds.includes(e.id));
    
    haveBackends[codebaseId] = backend.of(...codebaseEndpoints);
  }

  // Create deployment plan
  logger.debug("Creating deployment plan...");
  const deploymentPlans: Record<string, planner.DeploymentPlan> = {};
  
  for (const [codebaseId, wantBackend] of Object.entries(wantBackends)) {
    const haveBackend = haveBackends[codebaseId] || backend.empty();
    deploymentPlans[codebaseId] = planner.createDeploymentPlan({
      wantBackend,
      haveBackend,
      codebase: codebaseId
    });
  }

  // Set up Fabricator
  const executor = new QueueExecutor({
    retries: 3,
    backoff: 250,
    concurrency: 10
  });
  
  const functionExecutor = new QueueExecutor({
    retries: 3,
    backoff: 250,
    concurrency: 1 // Functions need to be deployed sequentially to avoid quota issues
  });

  // Get extension sources - these use the pre-packaged sources from Extensions API
  logger.debug("Preparing extension sources...");
  const sources = await createExtensionSources(instancesToProcess);

  const fabricator = new Fabricator({
    executor,
    functionExecutor,
    sources,
    appEngineLocation: "us-central1", // Default location
    projectNumber: projectNumber.toString()
  });

  // Merge all deployment plans into a single plan (following the pattern from functions/release/index.ts)
  let plan: planner.DeploymentPlan = {};
  for (const [codebaseId, deploymentPlan] of Object.entries(deploymentPlans)) {
    // Log the plan for debugging
    logger.debug(`Deployment plan for ${codebaseId}:`, JSON.stringify({
      endpointsToCreate: Object.values(deploymentPlan).reduce((sum, changes) => sum + changes.endpointsToCreate.length, 0),
      endpointsToUpdate: Object.values(deploymentPlan).reduce((sum, changes) => sum + changes.endpointsToUpdate.length, 0),
      endpointsToDelete: Object.values(deploymentPlan).reduce((sum, changes) => sum + changes.endpointsToDelete.length, 0),
    }));
    
    plan = {
      ...plan,
      ...deploymentPlan,
    };
  }

  // Execute deployment
  logger.info("Deploying functions...");
  
  // TODO: Add dry-run support to test conversion without actual deployment
  const summary = await fabricator.applyPlan(plan);

  // Check for errors
  if (summary.results.some(r => r.error)) {
    logger.error("Extension deployment failed with errors:");
    
    // Log detailed error information
    summary.results.forEach(r => {
      if (r.error) {
        logger.error(`Function ${r.endpoint.id}: ${r.error.message}`);
      }
    });
    
    throw new FirebaseError("Extension deployment via direct deployment failed");
  }

  logger.info(`✅ Extension deployment completed in ${summary.totalTime}ms`);
}