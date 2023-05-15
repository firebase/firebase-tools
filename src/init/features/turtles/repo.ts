import { cloudbuildOrigin } from "../../../api";
import { FirebaseError } from "../../../error";
import * as gcb from "../../../gcp/cloudbuild";
import { logger } from "../../../logger";
import * as poller from "../../../operation-poller";
import * as utils from "../../../utils";
import { promptOnce } from "../../../prompt";

const gcbPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: cloudbuildOrigin,
  apiVersion: "v2",
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

function extractRepoSlugFromURI(remoteUri: string): string | undefined {
  const match = /github.com\/(.+).git/.exec(remoteUri);
  if (!match) {
    return undefined;
  }
  return match[1];
}

function generateConnectionId(stackId: string): string {
  return `turtles-${stackId}-conn`;
}

function generateRepositoryId(): string | undefined {
  return `turtles-repo`;
}

/**
 * Prompts the user to link their stack to a GitHub repository.
 */
export async function linkGitHubRepository(
  projectId: string,
  location: string,
  stackId: string
): Promise<gcb.Repository> {
  const connectionId = generateConnectionId(stackId);
  await getOrCreateConnection(projectId, location, connectionId);

  let remoteUri = await promptRepositoryURI(projectId, location, connectionId);
  while (remoteUri === "") {
    await utils.openInBrowser("https://github.com/apps/google-cloud-build/installations/new");
    await promptOnce({
      type: "input",
      message:
        "Press any key once you have finished configuring your installation's access settings.",
    });
    remoteUri = await promptRepositoryURI(projectId, location, connectionId);
  }

  const repo = await getOrCreateRepository(projectId, location, connectionId, remoteUri);
  logger.info(`Successfully linked GitHub repository at remote URI ${remoteUri}.`);
  return repo;
}

async function promptRepositoryURI(
  projectId: string,
  location: string,
  connectionId: string
): Promise<string> {
  const resp = await gcb.fetchLinkableRepositories(projectId, location, connectionId);
  if (!resp.repositories || resp.repositories.length === 0) {
    throw new FirebaseError(
      "The GitHub App does not have access to any repositories. Please configure " +
        "your app installation permissions at https://github.com/settings/installations."
    );
  }
  const choices = resp.repositories.map((repo: gcb.Repository) => ({
    name: extractRepoSlugFromURI(repo.remoteUri) || repo.remoteUri,
    value: repo.remoteUri,
  }));
  choices.push({
    name: "Missing a repo? Select this option to configure your installation's access settings",
    value: "",
  });

  return await promptOnce({
    type: "list",
    message: "Which of the following repositories would you like to link?",
    choices,
  });
}

async function promptConnectionAuth(
  conn: gcb.Connection,
  projectId: string,
  location: string,
  connectionId: string
): Promise<gcb.Connection> {
  logger.info(conn.installationState.message);
  logger.info(conn.installationState.actionUri);
  await utils.openInBrowser(conn.installationState.actionUri);
  await promptOnce({
    type: "input",
    message:
      "Press any key once you have authorized Turtles (Cloud Build) to access your GitHub repo.",
  });
  return await gcb.getConnection(projectId, location, connectionId);
}

/**
 * Exported for unit testing.
 */
export async function getOrCreateConnection(
  projectId: string,
  location: string,
  connectionId: string
): Promise<gcb.Connection> {
  let conn: gcb.Connection;
  try {
    conn = await gcb.getConnection(projectId, location, connectionId);
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      const op = await gcb.createConnection(projectId, location, connectionId);
      conn = await poller.pollOperation<gcb.Connection>({
        ...gcbPollerOptions,
        pollerName: `create-${location}-${connectionId}`,
        operationResourceName: op.name,
      });
    } else {
      throw err;
    }
  }

  while (conn.installationState.stage !== "COMPLETE") {
    conn = await promptConnectionAuth(conn, projectId, location, connectionId);
  }
  return conn;
}

/**
 * Exported for unit testing.
 */
export async function getOrCreateRepository(
  projectId: string,
  location: string,
  connectionId: string,
  remoteUri: string
): Promise<gcb.Repository> {
  const repositoryId = generateRepositoryId();
  if (!repositoryId) {
    throw new FirebaseError(`Failed to generate repositoryId for URI "${remoteUri}".`);
  }
  let repo: gcb.Repository;
  try {
    repo = await gcb.getRepository(projectId, location, connectionId, repositoryId);
    const repoSlug = extractRepoSlugFromURI(repo.remoteUri);
    if (repoSlug) {
      throw new FirebaseError(`${repoSlug} has already been linked.`);
    }
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      const op = await gcb.createRepository(
        projectId,
        location,
        connectionId,
        repositoryId,
        remoteUri
      );
      repo = await poller.pollOperation<gcb.Repository>({
        ...gcbPollerOptions,
        pollerName: `create-${location}-${connectionId}-${repositoryId}`,
        operationResourceName: op.name,
      });
    } else {
      throw err;
    }
  }
  return repo;
}
