"use strict";

const { logger } = require("../logger");
const api = require("../api");
const clc = require("cli-color");
const _ = require("lodash");
const getProjectId = require("../getProjectId");
const utils = require("../utils");
const { FirebaseError } = require("../error");
const track = require("../track");
const lifecycleHooks = require("./lifecycleHooks");

const TARGETS: string[] = [
  "hosting",
  "database",
  "firestore",
  "functions",
  "storage",
  "remoteconfig",
];

const _noop = function () {
  return Promise.resolve();
};

async function executeChain(
  fns: DeployStep[],
  context: any,
  options: any,
  payload: any
): Promise<any> {
  const latest = (fns.shift() || _noop)(context, options, payload);
  if (fns.length) {
    await latest;
    return executeChain(fns, context, options, payload);
  }

  return latest;
}

interface DeployStep {
  (context: any, options: any, payload: any): Promise<any>;
}

interface DeployTarget {
  prepare?: DeployStep;
  deploy?: DeployStep;
  release?: DeployStep;
}

/**
 * The `deploy()` function runs through a three step deploy process for a listed
 * number of deploy targets. This allows deploys to be done all together or
 * for individual deployable elements to be deployed as such.
 */
export async function deploy(targetNames: string[], options: any, customContext: any = {}) {
  const projectId = getProjectId(options);
  const payload = {};
  // a shared context object for deploy targets to decorate as needed
  /** @type {object} */
  const context = Object.assign({ projectId }, customContext);
  const predeploys: DeployStep[] = [];
  const prepares: DeployStep[] = [];
  const deploys: DeployStep[] = [];
  const releases: DeployStep[] = [];
  const postdeploys: DeployStep[] = [];

  for (const targetName of targetNames) {
    if (!TARGETS.includes(targetName)) {
      throw new FirebaseError(`${clc.bold(targetName)} is not a valid deploy target`, { exit: 1 });
    }
    const target = (await import(`./${targetName}`)) as DeployTarget;

    predeploys.push(lifecycleHooks(targetName, "predeploy"));
    if (target.prepare) {
      prepares.push(target.prepare);
    }
    if (target.deploy) {
      deploys.push(target.deploy);
    }
    if (target.release) {
      releases.push(target.release);
    }
    postdeploys.push(lifecycleHooks(targetName, "postdeploy"));
  }

  logger.info();
  logger.info(clc.bold(clc.white("===") + " Deploying to '" + projectId + "'..."));
  logger.info();

  utils.logBullet("deploying " + clc.bold(targetNames.join(", ")));

  await executeChain(predeploys, context, options, payload);
  await executeChain(prepares, context, options, payload);
  await executeChain(deploys, context, options, payload);
  await executeChain(releases, context, options, payload);
  await executeChain(postdeploys, context, options, payload);

  if (_.has(options, "config.notes.databaseRules")) {
    track("Rules Deploy", options.config.notes.databaseRules);
  }

  logger.info();
  utils.logSuccess(clc.underline.bold("Deploy complete!"));
  logger.info();
  const deployedHosting = targetNames.includes("hosting");
  logger.info(clc.bold("Project Console:"), utils.consoleUrl(options.project, "/overview"));
  if (deployedHosting) {
    for (const deploy of context.hosting.deploys) {
      logger.info(clc.bold("Hosting URL:"), utils.addSubdomain(api.hostingOrigin, deploy.site));
    }
    const versionNames = context.hosting.deploys.map(
      (deploy: { version: string }) => deploy.version
    );
    return { hosting: versionNames.length === 1 ? versionNames[0] : versionNames };
  }
}

deploy.TARGETS = TARGETS;

module.exports = deploy;
