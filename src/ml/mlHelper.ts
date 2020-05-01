import Table = require("cli-table");
import { ensure } from "../ensureApiEnabled";
import * as getProjectId from "../getProjectId";
import { FirebaseModel } from "./models";

export const logPrefix = "ml";
export const verticalTableFormat = { style: { head: ["yellow"] } };
export const horizontalTableFormat = {
  head: ["modelId", "displayName", "tags", "status", "modelFormat"],
  style: { head: ["yellow"] },
};

/**
 * Ensures the Firebase ML API is enabled for the project.
 * @param options options for silent execution or not using options.markdown.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureFirebaseMlApiEnabled(options: any): Promise<void> {
  const projectId = getProjectId(options);
  return await ensure(projectId, "firebaseml.googleapis.com", "ml", options.markdown);
}

/**
 * Validates that the modelId has the proper format (non-empty, numeric string).
 * @param modelId The model ID to validate
 * @return {boolean} True if the model ID is valid. Otherwise false.
 */
export function isValidModelId(modelId: string): boolean {
  if (!modelId) {
    return false;
  }
  return !isNaN(Number(modelId));
}

/**
 * Extracts the modelId from the modelName.
 * @param resourceName The full resource name of the model to extract the ID from.
 * @return {string} The modelId portion of the model name.
 */
function extractModelId(resourceName: string): string {
  return resourceName?.split("/").pop() || "";
}

/**
 * Extract a status string from a model based on its state property.
 * @param model The model to extract the status string from
 * @return {string} The status of the model.
 */
function extractModelStatus(model: FirebaseModel): string {
  if (model.state?.validationError) {
    return "Invalid";
  }
  if (model.state?.published) {
    return "Published";
  }
  return "Ready to publish";
}

function extractModelLockStatus(model: FirebaseModel): boolean {
  // Model is "locked" if there are active server operations on it.
  if (!Array.isArray(model.activeOperations)) {
    return false;
  }
  return model.activeOperations.length > 0;
}

/**
 * Creates the display table for a model. (Used in GetModel.)
 * @param model The model to create the display Table for.
 * @return {Table} The display table.
 */
export function getTableForModel(model: FirebaseModel): Table {
  const table = new Table(verticalTableFormat);
  table.push({ modelId: extractModelId(model.name) }, { displayName: model.displayName });
  if (model.tags) {
    table.push({ tags: model.tags.join(", ") });
  }
  table.push({ status: extractModelStatus(model) });
  table.push({ locked: extractModelLockStatus(model) });
  if (model.tfliteModel) {
    table.push(
      { modelFormat: "TFLite" },
      { "modelSize (bytes)": model.tfliteModel.sizeBytes },
      { modelSource: model.tfliteModel.automlModel || model.tfliteModel.gcsTfliteUri || "unknown" }
    );
  }
  table.push(
    { createDate: new Date(model.createTime).toUTCString() },
    { updateDate: new Date(model.updateTime).toUTCString() }
  );

  return table;
}

/**
 * Creates the display table for a list of models (Used in ListModels)
 * @param models The models to create the table for
 * @return {Table} The display table.
 */
export function getTableForModelList(models: FirebaseModel[]): Table {
  const table = new Table(horizontalTableFormat);
  // head: ["modelId", "displayName", "tags", "status", "modelFormat"],
  for (const model of models) {
    table.push([
      extractModelId(model.name),
      model.displayName,
      model.tags ? model.tags.join(", ") : "",
      extractModelStatus(model),
      model.tfliteModel ? "TFLite" : "",
    ]);
  }

  return table;
}
