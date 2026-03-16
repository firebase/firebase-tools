import * as utils from "../../utils";
import { FirebaseError } from "../../error";
import { Field } from "../../deploy/functions/build";

/**
 * Represents a raw HCL expression that should NOT be quoted.
 * Used for resource references, function calls, or arithmetic.
 */
export interface Expression {
  ["@type"]: "HCLExpression";
  value: string;
}

export function expr(string: string): Expression {
  return { "@type": "HCLExpression", value: string };
}

/**
 * Valid types for HCL attributes.
 */
export type Value = string | number | boolean | Expression | Value[] | { [key: string]: Value };

/**
 * Represents a generic HCL block.
 * Structure: <type> "<label_1>" "<label_2>" { <body> }
 */
export interface Block {
  type: "output" | "resource" | "variable" | "data";
  labels?: string[];
  attributes: Record<string, Value>;
  nestedBlocks?: Block[];
}

export interface OutputBlock extends Block {
  type: "output";
  value: Value;
}

/**
 * Specialized interface for Terraform Resources.
 */
export interface ResourceBlock extends Block {
  type: "resource";
}

/**
 * Specialized interface for Terraform Variables.
 * NOTE: To make this code easier, we use variableName, which is really a type of label
 * as a scalar here.
 */
export interface VariableBlock extends Block {
  type: "variable";
  variableType: string;
}

/**
 * Specialized interface for Terraform Data blocks.
 */
export interface DataBlock extends Block {
  type: "data";
  state: string;
}

export function copyField<
  Kind extends string | number | boolean,
  Key extends string,
  T extends { [key in Key]?: Field<Kind> },
>(attributes: Record<string, Value>, source: T, field: Key): void {
  renameField(attributes, source, utils.toLowerSnakeCase(field), field);
}

export function renameField<
  Kind extends string | number | boolean,
  Key extends string,
  T extends { [key in Key]?: Field<Kind> },
>(attributes: Record<string, Value>, source: T, attribute_field: string, source_field: Key): void {
  const val = source[source_field];
  // Reset is always the behavior.
  if (val === null || val === undefined) {
    return;
  }

  // TODO: resolve params into an HCL expression if necessary
  if (typeof val === "string" && val.includes("{{")) {
    throw new FirebaseError("Parameterized fields are not supported in terraform yet");
  }
  attributes[attribute_field] = val as Value;
}

export function serializeValue(value: Value): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  } else if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  } else if (value === null || value === undefined) {
    return "null";
  } else if (Array.isArray(value)) {
    return `[${value.map((v) => serializeValue(v)).join(", ")}]`;
  } else if (typeof value === "object") {
    if (value["@type"] === "HCLExpression") {
      return (value as Expression).value;
    }
    // TODO: indentation level
    const entries = Object.entries(value).map(([k, v]) => `${k} = ${serializeValue(v)}`);
    return `{\n${entries.join("\n")}\n}`;
  }
  return "null";
}

// TODO: Grouping attributes (e.g. for_each at the top?), proper formatting for objects.
export function blockToString(block: Block): string {
  return `${block.type} ${block.labels?.map((l) => `"${l}" `).join("")} {
  ${Object.entries(block.attributes)
      .map(([key, value]) => `  ${key} = ${serializeValue(value)}`)
      .join("\n")}
}`;
}
