import { cloudbuildOrigin } from "../../../api";
import { FirebaseError } from "../../../error";
import {
  Connection,
  Repository,
  createConnection,
  createRepository,
  fetchLinkableRepositories,
  getConnection,
  getRepository,
} from "../../../gcp/cloudbuild";
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
 *
 */
export async function linkRepository(projectId: string, location: string): Promise<Repository> {
  const connectionId = generateConnectionId();
  const conn = await getOrCreateConnection(projectId, location, connectionId);
  if (conn.installationState.stage !== "COMPLETE") {
    throw new FirebaseError(conn.installationState.message);
  }

  const resp = await fetchLinkableRepositories(projectId, location, connectionId);
  const choices = resp.repositories.map((repo: Repository) => ({
    name: extractRepoSlugFromURI(repo.remoteUri),
    value: repo.remoteUri,
  }));
  const remoteUri: string = await promptOnce({
    type: "list",
    message: "Which of the following repositories would you like to link?",
    choices,
  });

  const repo = await getOrCreateRepository(projectId, location, connectionId, remoteUri);
  logger.info(`Successfully linked GitHub repository at remote URI ${remoteUri}.`);
  return repo;
}

// function detectGitRemote(remoteName: string): string {
//   return execSync(`git config remote.${remoteName}.url`).toString();
// }

function extractRepoSlugFromURI(remoteUri: string, separator = "/"): string {
  return remoteUri.split("/").slice(3, 5).join(separator).split(".")[0];
}

function generateRepositoryId(remoteUri: string): string {
  return extractRepoSlugFromURI(remoteUri, "--");
}

function generateConnectionId(): string {
  return "turtles-conn";
}

async function getOrCreateRepository(
  projectId: string,
  location: string,
  connectionId: string,
  remoteUri: string
): Promise<Repository> {
  const repositoryId = generateRepositoryId(remoteUri);
  console.log("*** REPOID ***", repositoryId);
  let repo: Repository;
  try {
    repo = await getRepository(projectId, location, connectionId, repositoryId);
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      const op = await createRepository(projectId, location, connectionId, repositoryId, remoteUri);
      repo = await poller.pollOperation<Repository>({
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

async function getOrCreateConnection(
  projectId: string,
  location: string,
  connectionId: string
): Promise<Connection> {
  let conn: Connection;
  try {
    conn = await getConnection(projectId, location, connectionId);
  } catch (err: unknown) {
    if ((err as FirebaseError).status === 404) {
      const op = await createConnection(projectId, location, connectionId);
      conn = await poller.pollOperation<Connection>({
        ...gcbPollerOptions,
        pollerName: `create-${location}-${connectionId}`,
        operationResourceName: op.name,
      });
    } else {
      throw err;
    }
  }

  // We can prompt users to select Continue once they have followed
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
      conn = await getConnection(projectId, location, connectionId);
    } else {
      // will return a connection in PENDING_USER_OAUTH state
      return conn;
    }
  }
  // may return a connection in non-COMPLETE state
  return conn;
}
