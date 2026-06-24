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

/**
 * Shorthand to create an expression that won't be quoted in the generated HCL.
 */
export function expr(string: string): Expression {
  return { "@type": "HCLExpression", value: string };
}

/**
 * Valid types for HCL attributes.
 */
export type Value =
  | string
  | number
  | boolean
  | null
  | Expression
  | Value[]
  | { [key: string]: Value };

/**
 * Represents a generic HCL block.
 * Structure: <type> "<label_1>" "<label_2>" { <body> }
 */
export interface Block {
  type: "output" | "resource" | "variable" | "data" | "locals";
  labels?: string[];
  attributes: Record<string, Value>;
  // TODO: nested blocks?
}

/**
 * Copy a field from a TypeScript interface into a Terraform HCL attribute map.
 * Automatically converts the field name to lower snake case.
 * Supports an optional transform function.
 */
export function copyField<
  Kind extends string | number | boolean,
  Key extends string,
  T extends { [key in Key]?: Field<Kind> },
>(
  attributes: Record<string, Value>,
  source: T,
  field: Key,
  transform: (v: NonNullable<Field<Kind>>) => Value = (v) => v,
): void {
  renameField(attributes, source, utils.toLowerSnakeCase(field), field, transform);
}

/**
 * Moves a field from a TypeScript interface to a Terraform HCL attribute map with explicit naming.
 * Skips over the field if it is missing from the original input.
 * Supports an optional transform function.
 */
export function renameField<
  Kind extends string | number | boolean,
  Key extends string,
  T extends { [key in Key]?: Field<Kind> },
>(
  attributes: Record<string, Value>,
  source: T,
  attributeField: string,
  sourceField: Key,
  transform: (v: NonNullable<Field<Kind>>) => Value = (v) => v,
): void {
  const val = source[sourceField];
  if (val === undefined) {
    return;
  }
  attributes[attributeField] = val === null ? null : transform(val);
}

/**
 * Fully qualifies project-relative SAs using the project variable.
 */
export function serviceAccount(sa: string): string {
  if (sa.endsWith("@")) {
    return `${sa}\${var.project}.iam.gserviceaccount.com`;
  }
  return sa;
}

/**
 * Serializes a Terraform Value to a string.
 * This is the recursive function that serializes blocks.
 * N.B. strings must be JSON encoded (e.g. have " around them and escape other quotes)
 * so they can be distinguished from bare strings which are HCL expressions (e.g. var refs).
 */
export function serializeValue(value: Value, indentation = 0): string {
  if (typeof value === "string") {
    value = value.replace(/{{ *params\.PROJECT_ID *}}/g, "${var.project}");
    if (value.includes("{{ ")) {
      throw new FirebaseError(
        "Generalized parameterized fields are not supported in terraform yet",
      );
    }
    return JSON.stringify(value);
  } else if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  } else if (value === null || value === undefined) {
    return "null";
  } else if (Array.isArray(value)) {
    // Use multi-line if there is any Object. But we exclude HCL expressions from "objects".
    if (
      value.some(
        (e) =>
          e !== null &&
          typeof e === "object" &&
          (Array.isArray(e) || e["@type"] !== "HCLExpression"),
      )
    ) {
      return `[\n${value.map((v) => "  ".repeat(indentation + 1) + serializeValue(v, indentation + 1)).join(",\n")}\n${"  ".repeat(indentation)}]`;
    }
    return `[${value.map((v) => serializeValue(v)).join(", ")}]`;
  } else if (typeof value === "object") {
    if (value["@type"] === "HCLExpression") {
      return (value as Expression).value;
    }
    const entries = Object.entries(value).map(
      ([k, v]) => `${"  ".repeat(indentation + 1)}${k} = ${serializeValue(v, indentation + 1)}`,
    );
    return `{\n${entries.join("\n")}\n${"  ".repeat(indentation)}}`;
  }
  throw new FirebaseError(`Unsupported terraform value type ${typeof value}`, { exit: 1 });
}

const PREFIX_ARGUMENTS = new Set(["count", "for_each", "provider"]);
const SUFFIX_ARGUMENTS = new Set(["lifecycle", "depends_on"]);

const NON_BLOCK_PARAMETERS: Record<string, Set<string>> = {
  google_cloudfunctions_function: new Set([
    "name",
    "runtime",
    "description",
    "available_memory_mb",
    "timeout",
    "entry_point",
    "source_archive_bucket",
    "source_archive_object",
    "trigger_http",
    "environment_variables",
    "vpc_connector",
    "service_account_email",
    "max_instances",
    "min_instances",
    "project",
    "region",
  ]),
  google_cloudfunctions2_function: new Set(["name", "location", "description", "project"]),
  google_cloud_scheduler_job: new Set([
    "name",
    "description",
    "schedule",
    "time_zone",
    "paused",
    "attempt_deadline",
    "region",
    "project",
  ]),
  google_cloud_tasks_queue: new Set(["name", "location", "desired_state", "project"]),
  google_eventarc_trigger: new Set(["name", "location", "project", "service_account"]),
  google_pubsub_topic: new Set([
    "name",
    "project",
    "labels",
    "kms_key_name",
    "message_retention_duration",
  ]),
  google_pubsub_subscription: new Set([
    "name",
    "topic",
    "project",
    "labels",
    "ack_deadline_seconds",
    "message_retention_duration",
    "retain_acked_messages",
    "enable_message_ordering",
    "filter",
  ]),
};

function serializeResourceAttributes(
  attributes: Record<string, Value>,
  resourceType: string,
  indentation = 0,
): string {
  const nonBlockParams = NON_BLOCK_PARAMETERS[resourceType] || new Set();

  const prefixGroup: string[] = [];
  const nonBlockGroup: string[] = [];
  const blockGroup: string[] = [];
  const suffixGroup: string[] = [];

  for (const [k, v] of Object.entries(attributes)) {
    const serialized = `${"  ".repeat(indentation + 1)}${k} = ${serializeValue(v, indentation + 1)}`;
    if (PREFIX_ARGUMENTS.has(k)) {
      prefixGroup.push(serialized);
    } else if (nonBlockParams.has(k)) {
      nonBlockGroup.push(serialized);
    } else if (SUFFIX_ARGUMENTS.has(k)) {
      suffixGroup.push(serialized);
    } else {
      blockGroup.push(serialized);
    }
  }

  const nonemptyGroups = [prefixGroup, nonBlockGroup, blockGroup, suffixGroup].filter(
    (g) => g.length > 0,
  );
  // Within each group, separate attributes with a newline. Separate different groups with an empty line.
  const joinedGroups = nonemptyGroups.map((g) => g.join("\n")).join("\n\n");

  return `{\n${joinedGroups}\n${"  ".repeat(indentation)}}`;
}

/**
 * Converts a block to a string.
 */
export function blockToString(block: Block, indentation: number = 0): string {
  const labels = (block.labels || []).map((l) => `"${l}"`).join(" ");

  if (block.type === "resource" && block.labels?.length) {
    const resourceType = block.labels[0];
    return `${"  ".repeat(indentation)}${block.type} ${labels ? labels + " " : ""}${serializeResourceAttributes(block.attributes, resourceType, indentation)}`;
  }

  return `${"  ".repeat(indentation)}${block.type} ${labels ? labels + " " : ""}${serializeValue(block.attributes, indentation)}`;
}
