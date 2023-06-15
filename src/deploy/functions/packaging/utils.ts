import { readFileSync } from "fs";
import * as yaml from "js-yaml";
import { FirebaseError } from "../../../error";

/**
 *
 */
export function readTypedJson<T>(filePath: string): T {
  try {
    const data = readFileSync(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch (err) {
    const msg = `${getErrorMessage(err, "Json reading error")}: ${filePath}`;
    throw new FirebaseError(msg);
  }
}

/**
 *
 */
export function readTypedYaml<T>(filePath: string): T {
  try {
    const rawContent = readFileSync(filePath, "utf-8");
    return yaml.load(rawContent) as T;
  } catch (err) {
    const msg = `${getErrorMessage(err, "Yaml reading error")}: ${filePath}`;
    throw new FirebaseError(msg);
  }
}

/**
 *
 */
export function getErrorMessage(err: unknown, defaultMessage?: string): string {
  return err instanceof Error ? err.message : err?.toString() || defaultMessage || "Error";
}
