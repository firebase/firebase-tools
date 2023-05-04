import { cloudbuildOrigin } from "../../../api";
import { FirebaseError } from "../../../error";
import * as gcb from "../../../gcp/cloudbuild";
import { logger } from "../../../logger";
import * as poller from "../../../operation-poller";
import * as open from "open";
import { promptOnce } from "../../../prompt";
// import { execSync } from "child_process";

const gcbPollerOptions: Omit<poller.OperationPollerOptions, "operationResourceName"> = {
  apiOrigin: cloudbuildOrigin,
  apiVersion: "v2",
  masterTimeout: 25 * 60 * 1_000,
  maxBackoff: 10_000,
};

/**
 * Prompts the user to link their stack to a GitHub repository.
 */
export async function linkGitHubRepository(
  projectId: string,
  location: string
): Promise<gcb.Repository> {
  const connectionId = generateConnectionId();
  const conn = await getOrCreateConnection(projectId, location, connectionId);
  if (conn.installationState.stage !== "COMPLETE") {
    throw new FirebaseError(conn.installationState.message);
  }

  const resp = await gcb.fetchLinkableRepositories(projectId, location, connectionId);
  if (resp.repositories.length === 0) {
    throw new FirebaseError(
      "The GitHub App does not have access to any repositories. Please configure" +
        "your app installation permissions at https://github.com/settings/installations."
    );
  }

  const choices = resp.repositories.map((repo: gcb.Repository) => ({
    name: extractRepoSlugFromURI(repo.remoteUri) || repo.remoteUri,
    value: repo.remoteUri,
  }));
  const remoteUri: string = await promptOnce({
    type: "list",
    message:
      "Which of the following repositories would you like to link? If you don't" +
      "see the repository, cancel the setup process by pressing Ctrl-C, configure" +
      "your app installation permissions at https://github.com/settings/installations," +
      "then run the command again.",
    choices,
  });

  const repo = await getOrCreateRepository(projectId, location, connectionId, remoteUri);
  logger.info(`Successfully linked GitHub repository at remote URI ${remoteUri}.`);
  return repo;
}

// function detectGitRemote(remoteName: string): string {
//   return execSync(`git config remote.${remoteName}.url`).toString();
// }

function extractRepoSlugFromURI(remoteUri: string): string | undefined {
  const match = /github.com\/(.+).git/.exec(remoteUri);
  if (!match) {
    return undefined;
  }
  return match[1];
}

function generateConnectionId(): string {
  return "turtles-conn";
}

function generateRepositoryId(remoteUri: string): string | undefined {
  return extractRepoSlugFromURI(remoteUri)?.replace("/", "--");
}

/**
 *
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

  // We prompt users to select Continue once they have followed
  // the link and successfully authorized Cloud Build to access
  // their GitHub account
  while (conn.installationState.stage === "PENDING_USER_OAUTH") {
    logger.info(conn.installationState.message);
    await open(conn.installationState.actionUri);
    const authorized = await promptOnce({
      type: "list",
      message:
        "Choose 'Continue' once you have authorized Turtles (Cloud Build) to access your GitHub repo, or cancel.",
      choices: [
        {
          name: "Continue",
          value: "continue",
        },
        {
          name: "Cancel",
          value: "cancel",
        },
      ],
    });
    if (authorized === "continue") {
      conn = await gcb.getConnection(projectId, location, connectionId);
    } else {
      // will return a connection in PENDING_USER_OAUTH state
      return conn;
    }
  }
  // may return a connection in non-COMPLETE state
  return conn;
}

/**
 *
 */
export async function getOrCreateRepository(
  projectId: string,
  location: string,
  connectionId: string,
  remoteUri: string
): Promise<gcb.Repository> {
  const repositoryId = generateRepositoryId(remoteUri);
  if (!repositoryId) {
    throw new FirebaseError(`Failed to generate repositoryId for URI "${remoteUri}".`);
  }
  let repo: gcb.Repository;
  try {
    repo = await gcb.getRepository(projectId, location, connectionId, repositoryId);
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
