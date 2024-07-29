import { execSync } from "child_process";
import * as fs from "fs-extra";
import { logger } from '../logger';
import { FirebaseError } from "../error";

export async function tryStartProgres() {
//  Question: Is postgres already running?
// Test: Check on default connection string (or conifgured connection string if one is available.
// If yes: Use the running postgres
 
// Try running postgres.app on MacOs
if (process.platform === "darwin") {
  const potentialPaths = [
    "~/Applications/Postgres.app",
    "/Applications/Postgres.app",
  ].filter(p => fs.existsSync(p));
  console.log("pp is", potentialPaths);
  if (potentialPaths.length) {
    try {
      const command = `open ${potentialPaths[0]}`;
      logger.debug("Trying ", command);
      const postgresApp = execSync(command)
      logger.debug(`App is ${postgresApp}`);
    } catch(e: any) {
      logger.debug(`docker test failed: ${e}`)
    }
  }
}
// Question: Is postgres already installed?
// Test: 'postgres --verison'
// If yes: Start up 
  try {
    const command = 'postgres --version';
    logger.debug("Trying ", command);
    const postgresTest = execSync(command);
    logger.debug(postgresTest);
  } catch(e: any) {
    logger.debug(`Postgres test failed: ${e}`)
  }


// Question: Is docker already installed?
// Test: childProcess.exec("docker –version")
// If yes: `docker run --name some-postgres -P 8080:8080 -e POSTGRES_PASSWORD=<generated> -d docker.io/postgres:15`
  try {
    const command = 'docker --version';
    logger.debug("Trying ", command);
    const postgresTest = execSync(command)

    logger.debug(postgresTest);
  } catch(e: any) {
    logger.debug(`docker test failed: ${e}`)
  }
// Question: Is podman already installed?
// Test: childProcess.exec("podman –version")
try {
  const command = 'podman --version';
  logger.debug("Trying ", command);
  const postgresTest = execSync(command)

  logger.debug(postgresTest);
} catch(e: any) {
  logger.debug(`podman test failed: ${e}`)
}
// If yes: `prodman run --name some-postgres -P 8080:8080 -e POSTGRES_PASSWORD=<generated> -d docker.io/postgres:15`
// Question: What platform are we on?
// Test: process.platform
// If MacOS: 
// Test: childProcess.exec("podman –version")
// If yes: `podman run --name some-postgres -P 8080:8080 -e POSTGRES_PASSWORD=<generated> -d docker.io/postgres:15`
  console.log(process.platform);
  throw new FirebaseError(`The Data Connect emulator requires a local installation of postgres, but none was found. Please visit ${linkToInstaller()} to install Postgres.`);
}

function linkToInstaller(): string {
  // TODO: Switch on platform, and link more specifically.
  // switch (process.platform) {
  //   case "win32":
  //   case "darwin":
  // TODO: Link to postgres.app here?

  // }
  return "https://www.postgresql.org/download/";
}