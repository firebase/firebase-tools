import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as spawn from "cross-spawn";

import * as downloadUtils from "../downloadUtils";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import * as rimraf from "rimraf";
import * as utils from "../utils";

const JAR_CACHE_DIR =
  process.env.FIREBASE_CRASHLYTICS_BUILDTOOLS_PATH ||
  path.join(os.homedir(), ".cache", "firebase", "crashlytics", "buildtools");

const JAR_VERSION = "2.9.2";
const JAR_URL = `https://dl.google.com/android/maven2/com/google/firebase/firebase-crashlytics-buildtools/${JAR_VERSION}/firebase-crashlytics-buildtools-${JAR_VERSION}.jar`;

/**
 * Returns the path to the jar file, downloading it if necessary.
 */
export async function fetchBuildtoolsJar(): Promise<string> {
  // If you set CRASHLYTICS_LOCAL_JAR to a path it will override the downloaded buildtools.jar
  if (process.env.CRASHLYTICS_LOCAL_JAR) {
    return process.env.CRASHLYTICS_LOCAL_JAR;
  }

  const jarPath = path.join(JAR_CACHE_DIR, `crashlytics-buildtools-${JAR_VERSION}.jar`);
  if (fs.existsSync(jarPath)) {
    logger.debug(`Buildtools Jar already downloaded at ${jarPath}`);
    return jarPath;
  }

  // If the Jar cache directory exists, but the jar for the current version
  // doesn't, then we're running the CLI with a new Jar version and we can
  // delete the old version.
  if (fs.existsSync(JAR_CACHE_DIR)) {
    logger.debug(
      `Deleting Jar cache at ${JAR_CACHE_DIR} because the CLI was run with a newer Jar version`,
    );
    rimraf.sync(JAR_CACHE_DIR);
  }
  utils.logBullet("Downloading crashlytics-buildtools.jar to " + jarPath);
  utils.logBullet(
    "For open source licenses used by this command, look in the META-INF directory in the buildtools.jar file",
  );
  const tmpfile = await downloadUtils.downloadToTmp(JAR_URL);
  fs.mkdirSync(JAR_CACHE_DIR, { recursive: true });
  fs.copySync(tmpfile, jarPath);

  return jarPath;
}

/**
 * Helper function to invoke the given set of arguments on the the executable jar
 */
export function runBuildtoolsCommand(jarFile: string, args: string[], debug: boolean): void {
  const fullArgs = ["-jar", jarFile, ...args, "-clientName", "firebase-cli;crashlytics-buildtools"];
  const outputs = spawn.sync("java", fullArgs, {
    stdio: debug ? "inherit" : "pipe",
  });

  if (outputs.status !== 0) {
    if (!debug) {
      utils.logWarning(outputs.stdout?.toString() || "An unknown error occurred");
    }
    throw new FirebaseError(`java command failed with args: ${fullArgs}`);
  }
}
