import * as yaml from "yaml";
import { FirebaseError } from "./error";
import { readFileFromDirectory } from "./utils";
import { writeFile } from "fs/promises";
import path from "path";

/**
 * Wraps `yaml.safeLoad` with an error handler to present better YAML parsing
 * errors.
 */
export function wrappedSafeLoad(source: string): any {
  try {
    return yaml.parse(source);
  } catch (err: any) {
    throw new FirebaseError(`YAML Error: ${err.message}`, { original: err });
  }
}

export function editYaml(source: string, ...edits: YamlEdit[]): string {
  const doc = yaml.parseDocument(source);
  for (const edit of edits) {
    doc.setIn(edit.set.path, edit.set.value);
  }
  return doc.toString();
}

export async function editYamlFile(
  directory: string,
  file: string,
  ...edits: YamlEdit[]
): Promise<void> {
  const { source } = await readFileFromDirectory(directory, file);
  const output = editYaml(source, ...edits);
  return writeFile(path.join(directory, file), output, "utf8");
}

export type YamlEdit = {
  // Right now, only `set` is supported. `delete`, etc. may be added if needed.
  set: { path: (string | number)[]; value: any };
};
