import * as clc from "colorette";

import { DEFAULT_RETRY_CODES, Executor } from "./executor";
import { FirebaseError } from "../../../error";
import { SourceTokenScraper } from "./sourceTokenScraper";
import { Timer } from "./timer";
import { assertExhaustive } from "../../../functional";
import { getHumanFriendlyRuntimeName } from "../runtimes";
import { eventarcOrigin, functionsOrigin, functionsV2Origin } from "../../../api";
import { logger } from "../../../logger";
import * as args from "../args";
import * as backend from "../backend";
import * as cloudtasks from "../../../gcp/cloudtasks";
import * as deploymentTool from "../../../deploymentTool";
import * as gcf from "../../../gcp/cloudfunctions";
import * as gcfV2 from "../../../gcp/cloudfunctionsv2";
import * as eventarc from "../../../gcp/eventarc";
import * as helper from "../functionsDeployHelper";
import * as planner from "./planner";
import * as poller from "../../../operation-poller";
import * as pubsub from "../../../gcp/pubsub";
import * as reporter from "./reporter";
import * as run from "../../../gcp/run";
import * as scheduler from "../../../gcp/cloudscheduler";
import * as utils from "../../../utils";
import * as services from "../services";
import { AUTH_BLOCKING_EVENTS } from "../../../functions/events/v1";
import { getDefaultComputeServiceAgent } from "../checkIam";
import { getHumanFriendlyPlatformName } from "../functionsDeployHelper";

// TODO: Tune this for better performance.
const gcfV1PollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: functionsOrigin,
  apiVersion: gcf.API_VERSION,
  masterTimeout: 25 * 60 * 1_000, // 25 minutes is the maximum build time for a function
  maxBackoff: 10_000,
};

const gcfV2PollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: functionsV2Origin,
  apiVersion: gcfV2.API_VERSION,
  masterTimeout: 25 * 60 * 1_000, // 25 minutes is the maximum build time for a function
  maxBackoff: 10_000,
};

const eventarcPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: eventarcOrigin,
  apiVersion: "v1",
  masterTimeout: 25 * 60 * 1_000, // 25 minutes is the maximum build time for a function
  maxBackoff: 10_000,
};

const CLOUD_RUN_RESOURCE_EXHAUSTED_CODE = 8;

export interface FabricatorArgs {
  executor: Executor;
  functionExecutor: Executor;
  appEngineLocation: string;
  sources: Record<string, args.Source>;
  projectNumber: string;
}

const rethrowAs =
  <T>(endpoint: backend.Endpoint, op: reporter.OperationType) =>
  (err: unknown): T => {
    logger.error((err as Error).message);
    throw new reporter.DeploymentError(endpoint, op, err);
  };

/** Fabricators make a customer's backend match a spec by applying a plan. */
export class Fabricator {
  executor: Executor;
  functionExecutor: Executor;
  sources: Record<string, args.Source>;
  appEngineLocation: string;
  projectNumber: string;

  constructor(args: FabricatorArgs) {
    this.executor = args.executor;
    this.functionExecutor = args.functionExecutor;
    this.sources = args.sources;
    this.appEngineLocation = args.appEngineLocation;
    this.projectNumber = args.projectNumber;
  }

  async applyPlan(plan: planner.DeploymentPlan): Promise<reporter.Summary> {
    const timer = new Timer();
    const summary: reporter.Summary = {
      totalTime: 0,
      results: [],
    };
    const deployChangesets = Object.values(plan).map(async (changes): Promise<void> => {
      const results = await this.applyChangeset(changes);
      summary.results.push(...results);
      return;
    });
    const promiseResults = await utils.allSettled(deployChangesets);

    const errs = promiseResults
      .filter((r) => r.status === "rejected")
      .map((r) => (r as utils.PromiseRejectedResult).reason);
    if (errs.length) {
      logger.debug(
        "Fabricator.applyRegionalChanges returned an unhandled exception. This should never happen",
        JSON.stringify(errs, null, 2),
      );
    }

    summary.totalTime = timer.stop();
    return summary;
  }

  async applyChangeset(changes: planner.Changeset): Promise<Array<reporter.DeployResult>> {
    const deployResults: reporter.DeployResult[] = [];
    const handle = async (
      op: reporter.OperationType,
      endpoint: backend.Endpoint,
      fn: () => Promise<void>,
    ): Promise<void> => {
      const timer = new Timer();
      const result: Partial<reporter.DeployResult> = { endpoint };
      try {
        await fn();
        this.logOpSuccess(op, endpoint);
      } catch (err: any) {
        result.error = err as Error;
      }
      result.durationMs = timer.stop();
      deployResults.push(result as reporter.DeployResult);
    };

    const upserts: Array<Promise<void>> = [];
    const scraperV1 = new SourceTokenScraper();
    const scraperV2 = new SourceTokenScraper();
    for (const endpoint of changes.endpointsToCreate) {
      this.logOpStart("creating", endpoint);
      upserts.push(
        handle("create", endpoint, () => this.createEndpoint(endpoint, scraperV1, scraperV2)),
      );
    }
    for (const endpoint of changes.endpointsToSkip) {
      utils.logSuccess(this.getLogSuccessMessage("skip", endpoint));
    }
    for (const update of changes.endpointsToUpdate) {
      this.logOpStart("updating", update.endpoint);
      upserts.push(
        handle("update", update.endpoint, () => this.updateEndpoint(update, scraperV1, scraperV2)),
      );
    }
    await utils.allSettled(upserts);

    // Note: every promise is generated by handle which records error in results.
    // We've used hasErrors as a cheater here instead of viewing the results of allSettled
    if (deployResults.find((r) => r.error)) {
      for (const endpoint of changes.endpointsToDelete) {
        deployResults.push({
          endpoint,
          durationMs: 0,
          error: new reporter.AbortedDeploymentError(endpoint),
        });
      }
      return deployResults;
    }

    const deletes: Array<Promise<void>> = [];
    for (const endpoint of changes.endpointsToDelete) {
      this.logOpStart("deleting", endpoint);
      deletes.push(handle("delete", endpoint, () => this.deleteEndpoint(endpoint)));
    }
    await utils.allSettled(deletes);

    return deployResults;
  }

  async createEndpoint(
    endpoint: backend.Endpoint,
    scraperV1: SourceTokenScraper,
    scraperV2: SourceTokenScraper,
  ): Promise<void> {
    endpoint.labels = { ...endpoint.labels, ...deploymentTool.labels() };
    if (endpoint.platform === "gcfv1") {
      await this.createV1Function(endpoint, scraperV1);
    } else if (endpoint.platform === "gcfv2") {
      await this.createV2Function(endpoint, scraperV2);
    } else {
      assertExhaustive(endpoint.platform);
    }

    await this.setTrigger(endpoint);
  }

  async updateEndpoint(
    update: planner.EndpointUpdate,
    scraperV1: SourceTokenScraper,
    scraperV2: SourceTokenScraper,
  ): Promise<void> {
    update.endpoint.labels = { ...update.endpoint.labels, ...deploymentTool.labels() };
    if (update.deleteAndRecreate) {
      await this.deleteEndpoint(update.deleteAndRecreate);
      await this.createEndpoint(update.endpoint, scraperV1, scraperV2);
      return;
    }

    if (update.endpoint.platform === "gcfv1") {
      await this.updateV1Function(update.endpoint, scraperV1);
    } else if (update.endpoint.platform === "gcfv2") {
      await this.updateV2Function(update.endpoint, scraperV2);
    } else {
      assertExhaustive(update.endpoint.platform);
    }

    await this.setTrigger(update.endpoint);
  }

  async deleteEndpoint(endpoint: backend.Endpoint): Promise<void> {
    await this.deleteTrigger(endpoint);
    if (endpoint.platform === "gcfv1") {
      await this.deleteV1Function(endpoint);
    } else {
      await this.deleteV2Function(endpoint);
    }
  }

  async createV1Function(endpoint: backend.Endpoint, scraper: SourceTokenScraper): Promise<void> {
    const sourceUrl = this.sources[endpoint.codebase!]?.sourceUrl;
    if (!sourceUrl) {
      logger.debug("Precondition failed. Cannot create a GCF function without sourceUrl");
      throw new Error("Precondition failed");
    }
    const apiFunction = gcf.functionFromEndpoint(endpoint, sourceUrl);
    // As a general security practice and way to smooth out the upgrade path
    // for GCF gen 2, we are enforcing that all new GCFv1 deploys will require
    // HTTPS
    if (apiFunction.httpsTrigger) {
      apiFunction.httpsTrigger.securityLevel = "SECURE_ALWAYS";
    }
    const resultFunction = await this.functionExecutor
      .run(async () => {
        // try to get the source token right before deploying
        apiFunction.sourceToken = await scraper.getToken();
        const op: { name: string } = await gcf.createFunction(apiFunction);
        return poller.pollOperation<gcf.CloudFunction>({
          ...gcfV1PollerOptions,
          pollerName: `create-${endpoint.codebase}-${endpoint.region}-${endpoint.id}`,
          operationResourceName: op.name,
          onPoll: scraper.poller,
        });
      })
      .catch(rethrowAs<gcf.CloudFunction>(endpoint, "create"));

    endpoint.uri = resultFunction?.httpsTrigger?.url;
    if (backend.isHttpsTriggered(endpoint)) {
      const invoker = endpoint.httpsTrigger.invoker || ["public"];
      if (!invoker.includes("private")) {
        await this.executor
          .run(async () => {
            await gcf.setInvokerCreate(endpoint.project, backend.functionName(endpoint), invoker);
          })
          .catch(rethrowAs(endpoint, "set invoker"));
      }
    } else if (backend.isCallableTriggered(endpoint)) {
      // Callable functions should always be public
      await this.executor
        .run(async () => {
          await gcf.setInvokerCreate(endpoint.project, backend.functionName(endpoint), ["public"]);
        })
        .catch(rethrowAs(endpoint, "set invoker"));
    } else if (backend.isTaskQueueTriggered(endpoint)) {
      // Like HTTPS triggers, taskQueueTriggers have an invoker, but unlike HTTPS they don't default
      // public.
      const invoker = endpoint.taskQueueTrigger.invoker;
      if (invoker && !invoker.includes("private")) {
        await this.executor
          .run(async () => {
            await gcf.setInvokerCreate(endpoint.project, backend.functionName(endpoint), invoker);
          })
          .catch(rethrowAs(endpoint, "set invoker"));
      }
    } else if (
      backend.isBlockingTriggered(endpoint) &&
      AUTH_BLOCKING_EVENTS.includes(endpoint.blockingTrigger.eventType as any)
    ) {
      // Auth Blocking functions should always be public
      await this.executor
        .run(async () => {
          await gcf.setInvokerCreate(endpoint.project, backend.functionName(endpoint), ["public"]);
        })
        .catch(rethrowAs(endpoint, "set invoker"));
    }
  }

  async createV2Function(endpoint: backend.Endpoint, scraper: SourceTokenScraper): Promise<void> {
    const storageSource = this.sources[endpoint.codebase!]?.storage;
    if (!storageSource) {
      logger.debug("Precondition failed. Cannot create a GCFv2 function without storage");
      throw new Error("Precondition failed");
    }
    const apiFunction = gcfV2.functionFromEndpoint({ ...endpoint, source: { storageSource } });

    // N.B. As of GCFv2 private preview GCF no longer creates Pub/Sub topics
    // for Pub/Sub event handlers. This may change, at which point this code
    // could be deleted.
    const topic = apiFunction.eventTrigger?.pubsubTopic;
    if (topic) {
      await this.executor
        .run(async () => {
          try {
            await pubsub.createTopic({ name: topic });
          } catch (err: any) {
            // Pub/Sub uses HTTP 409 (CONFLICT) with a status message of
            // ALREADY_EXISTS if the topic already exists.
            if (err.status === 409) {
              return;
            }
            throw new FirebaseError("Unexpected error creating Pub/Sub topic", {
              original: err as Error,
              status: err.status,
            });
          }
        })
        .catch(rethrowAs(endpoint, "create topic"));
    }

    // Like Pub/Sub, GCF requires a channel to exist before allowing the function
    // to be created. Like Pub/Sub we currently only support setting the name
    // of a channel, so we can do this once during createFunction alone. But if
    // Eventarc adds new features that we indulge in (e.g. 2P event providers)
    // things will get much more complicated. We'll have to make sure we keep
    // up to date on updates, and we will also have to worry about channels leftover
    // after deletion possibly incurring bills due to events still being sent.
    const channel = apiFunction.eventTrigger?.channel;
    if (channel) {
      await this.executor
        .run(async () => {
          try {
            // eventarc.createChannel doesn't always return 409 when channel already exists.
            // Ex. when channel exists and has active triggers the API will return 400 (bad
            // request) with message saying something about active triggers. So instead of
            // relying on 409 response we explicitly check for channel existence.
            if ((await eventarc.getChannel(channel)) !== undefined) {
              return;
            }
            const op: { name: string } = await eventarc.createChannel({ name: channel });
            return await poller.pollOperation<eventarc.Channel>({
              ...eventarcPollerOptions,
              pollerName: `create-${channel}-${endpoint.region}-${endpoint.id}`,
              operationResourceName: op.name,
            });
          } catch (err: any) {
            // if error status is 409, the channel already exists and we can deploy safely
            if (err.status === 409) {
              return;
            }
            throw new FirebaseError("Unexpected error creating Eventarc channel", {
              original: err as Error,
              status: err.status,
            });
          }
        })
        .catch(rethrowAs(endpoint, "upsert eventarc channel"));
    }

    let resultFunction: gcfV2.OutputCloudFunction | null = null;
    while (!resultFunction) {
      resultFunction = await this.functionExecutor
        .run(async () => {
          apiFunction.buildConfig.sourceToken = await scraper.getToken();
          const op: { name: string } = await gcfV2.createFunction(apiFunction);
          return await poller.pollOperation<gcfV2.OutputCloudFunction>({
            ...gcfV2PollerOptions,
            pollerName: `create-${endpoint.codebase}-${endpoint.region}-${endpoint.id}`,
            operationResourceName: op.name,
            onPoll: scraper.poller,
          });
        })
        .catch(async (err: any) => {
          // Abort waiting on source token so other concurrent calls don't get stuck
          scraper.abort();

          // If the createFunction call returns RPC error code RESOURCE_EXHAUSTED (8),
          // we have exhausted the underlying Cloud Run API quota. To retry, we need to
          // first delete the GCF function resource, then call createFunction again.
          if (err.code === CLOUD_RUN_RESOURCE_EXHAUSTED_CODE) {
            // we have to delete the broken function before we can re-create it
            await this.deleteV2Function(endpoint);
            return null;
          } else {
            logger.error((err as Error).message);
            throw new reporter.DeploymentError(endpoint, "create", err);
          }
        });
    }

    endpoint.uri = resultFunction.serviceConfig?.uri;
    const serviceName = resultFunction.serviceConfig?.service;
    endpoint.runServiceId = utils.last(serviceName?.split("/"));
    if (!serviceName) {
      logger.debug("Result function unexpectedly didn't have a service name.");
      utils.logLabeledWarning(
        "functions",
        "Updated function is not associated with a service. This deployment is in an unexpected state - please re-deploy your functions.",
      );
      return;
    }
    if (backend.isHttpsTriggered(endpoint)) {
      const invoker = endpoint.httpsTrigger.invoker || ["public"];
      if (!invoker.includes("private")) {
        await this.executor
          .run(() => run.setInvokerCreate(endpoint.project, serviceName, invoker))
          .catch(rethrowAs(endpoint, "set invoker"));
      }
    } else if (backend.isCallableTriggered(endpoint)) {
      // Callable functions should always be public
      await this.executor
        .run(() => run.setInvokerCreate(endpoint.project, serviceName, ["public"]))
        .catch(rethrowAs(endpoint, "set invoker"));
    } else if (backend.isTaskQueueTriggered(endpoint)) {
      // Like HTTPS triggers, taskQueueTriggers have an invoker, but unlike HTTPS they don't default
      // public.
      const invoker = endpoint.taskQueueTrigger.invoker;
      if (invoker && !invoker.includes("private")) {
        await this.executor
          .run(async () => {
            await run.setInvokerCreate(endpoint.project, serviceName, invoker);
          })
          .catch(rethrowAs(endpoint, "set invoker"));
      }
    } else if (
      backend.isBlockingTriggered(endpoint) &&
      AUTH_BLOCKING_EVENTS.includes(endpoint.blockingTrigger.eventType as any)
    ) {
      // Auth Blocking functions should always be public
      await this.executor
        .run(() => run.setInvokerCreate(endpoint.project, serviceName, ["public"]))
        .catch(rethrowAs(endpoint, "set invoker"));
    } else if (backend.isScheduleTriggered(endpoint)) {
      const invoker = [getDefaultComputeServiceAgent(this.projectNumber)];
      await this.executor
        .run(() => run.setInvokerCreate(endpoint.project, serviceName, invoker))
        .catch(rethrowAs(endpoint, "set invoker"));
    }
  }

  async updateV1Function(endpoint: backend.Endpoint, scraper: SourceTokenScraper): Promise<void> {
    const sourceUrl = this.sources[endpoint.codebase!]?.sourceUrl;
    if (!sourceUrl) {
      logger.debug("Precondition failed. Cannot update a GCF function without sourceUrl");
      throw new Error("Precondition failed");
    }
    const apiFunction = gcf.functionFromEndpoint(endpoint, sourceUrl);

    const resultFunction = await this.functionExecutor
      .run(async () => {
        apiFunction.sourceToken = await scraper.getToken();
        const op: { name: string } = await gcf.updateFunction(apiFunction);
        return await poller.pollOperation<gcf.CloudFunction>({
          ...gcfV1PollerOptions,
          pollerName: `update-${endpoint.codebase}-${endpoint.region}-${endpoint.id}`,
          operationResourceName: op.name,
          onPoll: scraper.poller,
        });
      })
      .catch(rethrowAs<gcf.CloudFunction>(endpoint, "update"));

    endpoint.uri = resultFunction?.httpsTrigger?.url;
    let invoker: string[] | undefined;
    if (backend.isHttpsTriggered(endpoint)) {
      invoker = endpoint.httpsTrigger.invoker === null ? ["public"] : endpoint.httpsTrigger.invoker;
    } else if (backend.isTaskQueueTriggered(endpoint)) {
      invoker = endpoint.taskQueueTrigger.invoker === null ? [] : endpoint.taskQueueTrigger.invoker;
    } else if (
      backend.isBlockingTriggered(endpoint) &&
      AUTH_BLOCKING_EVENTS.includes(endpoint.blockingTrigger.eventType as any)
    ) {
      invoker = ["public"];
    }
    if (invoker) {
      await this.executor
        .run(() => gcf.setInvokerUpdate(endpoint.project, backend.functionName(endpoint), invoker!))
        .catch(rethrowAs(endpoint, "set invoker"));
    }
  }

  async updateV2Function(endpoint: backend.Endpoint, scraper: SourceTokenScraper): Promise<void> {
    const storageSource = this.sources[endpoint.codebase!]?.storage;
    if (!storageSource) {
      logger.debug("Precondition failed. Cannot update a GCFv2 function without storage");
      throw new Error("Precondition failed");
    }
    const apiFunction = gcfV2.functionFromEndpoint({ ...endpoint, source: { storageSource } });

    // N.B. As of GCFv2 private preview the API chokes on any update call that
    // includes the pub/sub topic even if that topic is unchanged.
    // We know that the user hasn't changed the topic between deploys because
    // of checkForInvalidChangeOfTrigger().
    if (apiFunction.eventTrigger?.pubsubTopic) {
      delete apiFunction.eventTrigger.pubsubTopic;
    }

    const resultFunction = await this.functionExecutor
      .run(
        async () => {
          apiFunction.buildConfig.sourceToken = await scraper.getToken();
          const op: { name: string } = await gcfV2.updateFunction(apiFunction);
          return await poller.pollOperation<gcfV2.OutputCloudFunction>({
            ...gcfV2PollerOptions,
            pollerName: `update-${endpoint.codebase}-${endpoint.region}-${endpoint.id}`,
            operationResourceName: op.name,
            onPoll: scraper.poller,
          });
        },
        { retryCodes: [...DEFAULT_RETRY_CODES, CLOUD_RUN_RESOURCE_EXHAUSTED_CODE] },
      )
      .catch((err: any) => {
        scraper.abort();
        logger.error((err as Error).message);
        throw new reporter.DeploymentError(endpoint, "update", err);
      });

    endpoint.uri = resultFunction.serviceConfig?.uri;
    const serviceName = resultFunction.serviceConfig?.service;
    endpoint.runServiceId = utils.last(serviceName?.split("/"));
    if (!serviceName) {
      logger.debug("Result function unexpectedly didn't have a service name.");
      utils.logLabeledWarning(
        "functions",
        "Updated function is not associated with a service. This deployment is in an unexpected state - please re-deploy your functions.",
      );
      return;
    }
    let invoker: string[] | undefined;
    if (backend.isHttpsTriggered(endpoint)) {
      invoker = endpoint.httpsTrigger.invoker === null ? ["public"] : endpoint.httpsTrigger.invoker;
    } else if (backend.isTaskQueueTriggered(endpoint)) {
      invoker = endpoint.taskQueueTrigger.invoker === null ? [] : endpoint.taskQueueTrigger.invoker;
    } else if (
      backend.isBlockingTriggered(endpoint) &&
      AUTH_BLOCKING_EVENTS.includes(endpoint.blockingTrigger.eventType as any)
    ) {
      invoker = ["public"];
    } else if (backend.isScheduleTriggered(endpoint)) {
      invoker = [getDefaultComputeServiceAgent(this.projectNumber)];
    }

    if (invoker) {
      await this.executor
        .run(() => run.setInvokerUpdate(endpoint.project, serviceName, invoker!))
        .catch(rethrowAs(endpoint, "set invoker"));
    }
  }

  async deleteV1Function(endpoint: backend.Endpoint): Promise<void> {
    const fnName = backend.functionName(endpoint);
    await this.functionExecutor
      .run(async () => {
        const op: { name: string } = await gcf.deleteFunction(fnName);
        const pollerOptions = {
          ...gcfV1PollerOptions,
          pollerName: `delete-${endpoint.codebase}-${endpoint.region}-${endpoint.id}`,
          operationResourceName: op.name,
        };
        await poller.pollOperation<void>(pollerOptions);
      })
      .catch(rethrowAs(endpoint, "delete"));
  }

  async deleteV2Function(endpoint: backend.Endpoint): Promise<void> {
    const fnName = backend.functionName(endpoint);
    await this.functionExecutor
      .run(
        async () => {
          const op: { name: string } = await gcfV2.deleteFunction(fnName);
          const pollerOptions = {
            ...gcfV2PollerOptions,
            pollerName: `delete-${endpoint.codebase}-${endpoint.region}-${endpoint.id}`,
            operationResourceName: op.name,
          };
          await poller.pollOperation<void>(pollerOptions);
        },
        { retryCodes: [...DEFAULT_RETRY_CODES, CLOUD_RUN_RESOURCE_EXHAUSTED_CODE] },
      )
      .catch(rethrowAs(endpoint, "delete"));
  }

  async setRunTraits(serviceName: string, endpoint: backend.Endpoint): Promise<void> {
    await this.functionExecutor
      .run(async () => {
        const service = await run.getService(serviceName);
        let changed = false;
        if (service.spec.template.spec.containerConcurrency !== endpoint.concurrency) {
          service.spec.template.spec.containerConcurrency = endpoint.concurrency;
          changed = true;
        }

        if (+service.spec.template.spec.containers[0].resources.limits.cpu !== endpoint.cpu) {
          service.spec.template.spec.containers[0].resources.limits.cpu = `${
            endpoint.cpu as number
          }`;
          changed = true;
        }

        if (!changed) {
          logger.debug("Skipping setRunTraits on", serviceName, " because it already matches");
          return;
        }

        // Without this there will be a conflict creating the new spec from the tempalte
        delete service.spec.template.metadata.name;
        await run.updateService(serviceName, service);
      })
      .catch(rethrowAs(endpoint, "set concurrency"));
  }

  // Set/Delete trigger is responsible for wiring up a function with any trigger not owned
  // by the GCF API. This includes schedules, task queues, and blocking function triggers.
  async setTrigger(endpoint: backend.Endpoint): Promise<void> {
    if (backend.isScheduleTriggered(endpoint)) {
      if (endpoint.platform === "gcfv1") {
        await this.upsertScheduleV1(endpoint);
        return;
      } else if (endpoint.platform === "gcfv2") {
        await this.upsertScheduleV2(endpoint);
        return;
      }
      assertExhaustive(endpoint.platform);
    } else if (backend.isTaskQueueTriggered(endpoint)) {
      await this.upsertTaskQueue(endpoint);
    } else if (backend.isBlockingTriggered(endpoint)) {
      await this.registerBlockingTrigger(endpoint);
    }
  }

  async deleteTrigger(endpoint: backend.Endpoint): Promise<void> {
    if (backend.isScheduleTriggered(endpoint)) {
      if (endpoint.platform === "gcfv1") {
        await this.deleteScheduleV1(endpoint);
        return;
      } else if (endpoint.platform === "gcfv2") {
        await this.deleteScheduleV2(endpoint);
        return;
      }
      assertExhaustive(endpoint.platform);
    } else if (backend.isTaskQueueTriggered(endpoint)) {
      await this.disableTaskQueue(endpoint);
    } else if (backend.isBlockingTriggered(endpoint)) {
      await this.unregisterBlockingTrigger(endpoint);
    }
    // N.B. Like Pub/Sub topics, we don't delete Eventarc channels because we
    // don't know if there are any subscribers or not. If we start supporting 2P
    // channels, we might need to revisit this or else the events will still get
    // published and the customer will still get charged.
  }

  async upsertScheduleV1(endpoint: backend.Endpoint & backend.ScheduleTriggered): Promise<void> {
    // The Pub/Sub topic is already created
    const job = scheduler.jobFromEndpoint(endpoint, this.appEngineLocation, this.projectNumber);
    await this.executor
      .run(() => scheduler.createOrReplaceJob(job))
      .catch(rethrowAs(endpoint, "upsert schedule"));
  }

  async upsertScheduleV2(endpoint: backend.Endpoint & backend.ScheduleTriggered): Promise<void> {
    const job = scheduler.jobFromEndpoint(endpoint, endpoint.region, this.projectNumber);
    await this.executor
      .run(() => scheduler.createOrReplaceJob(job))
      .catch(rethrowAs(endpoint, "upsert schedule"));
  }

  async upsertTaskQueue(endpoint: backend.Endpoint & backend.TaskQueueTriggered): Promise<void> {
    const queue = cloudtasks.queueFromEndpoint(endpoint);
    await this.executor
      .run(() => cloudtasks.upsertQueue(queue))
      .catch(rethrowAs(endpoint, "upsert task queue"));

    // Note: should we split setTrigger into createTrigger and updateTrigger so we can avoid a
    // getIamPolicy on create?
    if (endpoint.taskQueueTrigger.invoker) {
      await this.executor
        .run(() => cloudtasks.setEnqueuer(queue.name, endpoint.taskQueueTrigger.invoker!))
        .catch(rethrowAs(endpoint, "set invoker"));
    }
  }

  async registerBlockingTrigger(
    endpoint: backend.Endpoint & backend.BlockingTriggered,
  ): Promise<void> {
    await this.executor
      .run(() => services.serviceForEndpoint(endpoint).registerTrigger(endpoint))
      .catch(rethrowAs(endpoint, "register blocking trigger"));
  }

  async deleteScheduleV1(endpoint: backend.Endpoint & backend.ScheduleTriggered): Promise<void> {
    const jobName = scheduler.jobNameForEndpoint(endpoint, this.appEngineLocation);
    await this.executor
      .run(() => scheduler.deleteJob(jobName))
      .catch(rethrowAs(endpoint, "delete schedule"));

    const topicName = scheduler.topicNameForEndpoint(endpoint);
    await this.executor
      .run(() => pubsub.deleteTopic(topicName))
      .catch(rethrowAs(endpoint, "delete topic"));
  }

  async deleteScheduleV2(endpoint: backend.Endpoint & backend.ScheduleTriggered): Promise<void> {
    const jobName = scheduler.jobNameForEndpoint(endpoint, endpoint.region);
    await this.executor
      .run(() => scheduler.deleteJob(jobName))
      .catch(rethrowAs(endpoint, "delete schedule"));
  }

  async disableTaskQueue(endpoint: backend.Endpoint & backend.TaskQueueTriggered): Promise<void> {
    const update = {
      name: cloudtasks.queueNameForEndpoint(endpoint),
      state: "DISABLED" as cloudtasks.State,
    };
    await this.executor
      .run(() => cloudtasks.updateQueue(update))
      .catch(rethrowAs(endpoint, "disable task queue"));
  }

  async unregisterBlockingTrigger(
    endpoint: backend.Endpoint & backend.BlockingTriggered,
  ): Promise<void> {
    await this.executor
      .run(() => services.serviceForEndpoint(endpoint).unregisterTrigger(endpoint))
      .catch(rethrowAs(endpoint, "unregister blocking trigger"));
  }

  logOpStart(op: string, endpoint: backend.Endpoint): void {
    const runtime = getHumanFriendlyRuntimeName(endpoint.runtime);
    const platform = getHumanFriendlyPlatformName(endpoint.platform);
    const label = helper.getFunctionLabel(endpoint);
    utils.logLabeledBullet(
      "functions",
      `${op} ${runtime} (${platform}) function ${clc.bold(label)}...`,
    );
  }

  logOpSuccess(op: string, endpoint: backend.Endpoint): void {
    utils.logSuccess(this.getLogSuccessMessage(op, endpoint));
  }

  /**
   * Returns the log messaging for a successful operation.
   */
  getLogSuccessMessage(op: string, endpoint: backend.Endpoint) {
    const label = helper.getFunctionLabel(endpoint);
    switch (op) {
      case "skip":
        return `${clc.bold(clc.magenta(`functions[${label}]`))} Skipped (No changes detected)`;
      default:
        return `${clc.bold(clc.green(`functions[${label}]`))} Successful ${op} operation.`;
    }
  }

  /**
   * Returns the log messaging for no-op functions that were skipped.
   */
  getSkippedDeployingNopOpMessage(endpoints: backend.Endpoint[]) {
    const functionNames = endpoints.map((endpoint) => endpoint.id).join(",");
    return `${clc.bold(clc.magenta(`functions:`))} You can re-deploy skipped functions with:
              ${clc.bold(`firebase deploy --only functions:${functionNames}`)} or ${clc.bold(
                `FUNCTIONS_DEPLOY_UNCHANGED=true firebase deploy`,
              )}`;
  }
}
