import * as fs from "fs-extra";
import { FirebaseError } from "../error";
import { needProjectNumber } from "../projectUtils";
import { FieldHints, LoginCredential, TestDevice } from "./types";

/**
 * Takes in comma-separated string or a path to a comma- or newline-separated
 * file and converts the input into an string[].
 * Value takes precedent over file.
 */
export function parseIntoStringArray(value: string, file: string): string[] {
  // If there is no value then the file gets parsed into a string to be split
  if (!value && file) {
    ensureFileExists(file);
    value = fs.readFileSync(file, "utf8");
  }

  // The value is split into a string[]
  if (value) {
    return splitter(value);
  }
  return [];
}

/**
 * Takes in a string[] or a path to a comma- or newline-separated file of
 * testers emails and returns a string[] of emails.
 */
export function getEmails(emails: string[], file: string): string[] {
  if (emails.length === 0) {
    ensureFileExists(file);
    const readFile = fs.readFileSync(file, "utf8");
    return splitter(readFile);
  }
  return emails;
}

// Ensures a the file path that the user input is valid
export function ensureFileExists(file: string, message = ""): void {
  if (!fs.existsSync(file)) {
    throw new FirebaseError(`File ${file} does not exist: ${message}`);
  }
}

// Splits string by either comma or new line
function splitter(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => !!entry);
}

// Gets project name from project number
export async function getProjectName(options: any): Promise<string> {
  const projectNumber = await needProjectNumber(options);
  return `projects/${projectNumber}`;
}

// Gets app name from appId
export function getAppName(options: any): string {
  if (!options.app) {
    throw new FirebaseError("set the --app option to a valid Firebase app id and try again");
  }
  const appId = options.app;
  return `projects/${appId.split(":")[1]}/apps/${appId}`;
}

/**
 * Takes in comma separated string or a path to a comma/new line separated file
 * and converts the input into a string[] of test device strings.
 * Value takes precedent over file.
 */
export function parseTestDevices(value: string, file: string): TestDevice[] {
  // If there is no value then the file gets parsed into a string to be split
  if (!value && file) {
    ensureFileExists(file);
    value = fs.readFileSync(file, "utf8");
  }

  if (!value) {
    return [];
  }

  return value
    .split(/[;\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => !!entry)
    .map((str) => parseTestDevice(str));
}

function parseTestDevice(testDeviceString: string): TestDevice {
  const entries = testDeviceString.split(",");
  const allowedKeys = new Set(["model", "version", "orientation", "locale"]);
  let model: string | undefined;
  let version: string | undefined;
  let orientation: string | undefined;
  let locale: string | undefined;
  for (const entry of entries) {
    const keyAndValue = entry.split("=");
    switch (keyAndValue[0]) {
      case "model":
        model = keyAndValue[1];
        break;
      case "version":
        version = keyAndValue[1];
        break;
      case "orientation":
        orientation = keyAndValue[1];
        break;
      case "locale":
        locale = keyAndValue[1];
        break;
      default:
        throw new FirebaseError(
          `Unrecognized key in test devices. Can only contain ${Array.from(allowedKeys).join(", ")}`,
        );
    }
  }

  if (!model || !version || !orientation || !locale) {
    throw new FirebaseError(
      "Test devices must be in the format 'model=<model-id>,version=<os-version-id>,locale=<locale>,orientation=<orientation>'",
    );
  }
  return { model, version, locale, orientation };
}

/**
 * Takes option values for username and password related options and returns a LoginCredential
 * object that can be passed to the API.
 */
export function getLoginCredential(args: {
  username?: string;
  password?: string;
  passwordFile?: string;
  usernameResourceName?: string;
  passwordResourceName?: string;
}): LoginCredential | undefined {
  const { username, passwordFile, usernameResourceName, passwordResourceName } = args;
  let password = args.password;
  if (!password && passwordFile) {
    ensureFileExists(passwordFile);
    password = fs.readFileSync(passwordFile, "utf8").trim();
  }

  if (isPresenceMismatched(usernameResourceName, passwordResourceName)) {
    throw new FirebaseError(
      "Username and password resource names for automated tests need to be specified together.",
    );
  }
  let fieldHints: FieldHints | undefined;
  if (usernameResourceName && passwordResourceName) {
    fieldHints = {
      usernameResourceName: usernameResourceName,
      passwordResourceName: passwordResourceName,
    };
  }

  if (isPresenceMismatched(username, password)) {
    throw new FirebaseError(
      "Username and password for automated tests need to be specified together.",
    );
  }
  let loginCredential: LoginCredential | undefined;
  if (username && password) {
    loginCredential = { username, password, fieldHints };
  } else if (fieldHints) {
    throw new FirebaseError(
      "Must specify username and password for automated tests if resource names are set",
    );
  }
  return loginCredential;
}

function isPresenceMismatched(value1?: string, value2?: string) {
  return (value1 && !value2) || (!value1 && value2);
}
