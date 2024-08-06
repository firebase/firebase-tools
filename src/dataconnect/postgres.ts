import { execSync } from "child_process";
import * as fs from "fs-extra";
import * as pg from "pg";

import { logger } from "../logger";
import { FirebaseError } from "../error";
import { RC } from "../rc";
import { sleep } from "../utils";
import { promptOnce } from "../prompt";
import { downloadPostgresApp } from "../emulator/download";

// postgresql://localhost:5432 is a default out of the box value for most installations of Postgres
export const DEFAULT_POSTGRES_CONNECTION = "postgresql://localhost:5432?sslmode=disable";

export async function tryStartProgres(rc: RC): Promise<string> {
  //  Question: Is postgres already running?
  // Test: Check on default connection string (or configured connection string if one is available.
  // If yes: Use the running postgres

  const alreadyRunningConn = await checkForRunningPostgres(rc);
  if (alreadyRunningConn) {
    return alreadyRunningConn;
  }

  const postgressAppConn = await tryPostgressApp(rc);
  if (postgressAppConn) {
    return postgressAppConn;
  }

  // Question: Is postgres already installed?
  // Test: 'postgres --verison'
  // If yes: Start up
  try {
    const command = "postgres --version";
    logger.debug("Trying ", command);
    const postgresTest = execSync(command);
    logger.debug(postgresTest);
  } catch (e: any) {
    logger.debug(`Postgres test failed: ${e}`);
  }

  // Question: Is docker already installed?
  // Test: childProcess.exec("docker –version")
  // If yes: `docker run --name some-postgres -P 8080:8080 -e POSTGRES_PASSWORD=<generated> -d docker.io/postgres:15`
  try {
    const command = "docker --version";
    logger.debug("Trying ", command);
    const postgresTest = execSync(command);

    logger.debug(postgresTest);
  } catch (e: any) {
    logger.debug(`docker test failed: ${e}`);
  }
  // Question: Is podman already installed?
  // Test: childProcess.exec("podman –version")
  try {
    const command = "podman --version";
    logger.debug("Trying ", command);
    const postgresTest = execSync(command);

    logger.debug(postgresTest);
  } catch (e: any) {
    logger.debug(`podman test failed: ${e}`);
  }
  // If yes: `prodman run --name some-postgres -P 8080:8080 -e POSTGRES_PASSWORD=<generated> -d docker.io/postgres:15`
  // Question: What platform are we on?
  // Test: process.platform
  // If MacOS:
  // Test: childProcess.exec("podman –version")
  // If yes: `podman run --name some-postgres -P 8080:8080 -e POSTGRES_PASSWORD=<generated> -d docker.io/postgres:15`
  console.log(process.platform);
  throw new FirebaseError(
    `The Data Connect emulator requires a local installation of postgres, but none was found. Please visit ${linkToInstaller()} to install Postgres.`,
  );
}

// Attempts to connect to a running postgres instance and run a simple healthcheck query.
// If successful, returns the connection string that worked.
// If not, return ""
async function checkForRunningPostgres(rc: RC): Promise<string> {
  const potentialConnectionStrings = [DEFAULT_POSTGRES_CONNECTION];
  const configuredLCS = rc.getDataconnect().postgres?.localConnectionString;
  if (configuredLCS && !potentialConnectionStrings.includes(configuredLCS)) {
    potentialConnectionStrings.push(configuredLCS);
  }
  for (const conn of potentialConnectionStrings) {
    console.log(`trying conn str ${configuredLCS}`);
    try {
      const client = new pg.Client(conn);
      await client.connect();
      // dummy command
      const res = await client.query("select version()");
      console.log(`Success: ${JSON.stringify(res)}`);
      return conn;
    } catch (err: any) {
      console.log(`unable to connect to ${conn}`);
    }
  }
  return "";
}

// Try running postgres.app on MacOs
async function tryPostgressApp(rc: RC): Promise<string> {
  if (process.platform === "darwin") {
    logger.info("Checking if Postgres.app is installed...");
    const potentialPaths = ["~/Applications/Postgres.app", "/Applications/Postgres.app"].filter(
      (p) => fs.existsSync(p),
    );
    if (!potentialPaths.length) {
      // If it's not downloaded, try to download it
      const freshlyDownloaded = await promptInstallPostgresApp();
      potentialPaths.push(freshlyDownloaded);
    }
    if (potentialPaths.length) {
      try {
        logger.info("Starting Postgres.app...");
        const command = `open ${potentialPaths[0]}`;
        execSync(command);
        // It takes a short bit of time after the app opens to start accepting connections.
        await sleep(1000);
        const pgAppConn = await checkForRunningPostgres(rc);
        if (pgAppConn) {
          logger.info("Started Postgres.app.");
          return pgAppConn;
        }
      } catch (e: any) {
        logger.debug(`Failed to open Postgres.app; ${e}`);
      }
    }
  }
  return "";
}

async function promptInstallPostgresApp(): Promise<string> {
  if (
    !(await promptOnce({
      message:
        "No local installation of Postgres detected. Would you like to download Postgres.app now?",
      type: "confirm",
    }))
  ) {
    throw new FirebaseError(
      "Command aborted. Please install Postgres to use the Data Connect emulator.",
    );
  }
  const app = await downloadPostgresApp();
  await sleep(1000);
  return app;
}

function linkToInstaller(): string {
  return "https://www.postgresql.org/download/";
}
