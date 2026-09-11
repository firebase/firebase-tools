import * as path from "path";
import * as fs from "fs";
import {
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  Kind,
  TypeNode,
  parse,
} from "graphql";
import { ResolvedDataConnectConfig } from "./config";
import { unwrapTypeName } from "../utils/graphql";

/** A field eligible for @allow(fields: "..."). */
export interface AllowableField {
  name: string;
  typeName: string;
  description?: string;
  isRelational: boolean;
  childDataTypeName?: string;
}

interface RelationInfo {
  childType: string;
  refField: string;
}

/**
 * Resolves allowable fields for the @allow directive by parsing generated
 * .dataconnect/schema/ files and user schema @ref directives.
 */
export class AllowDirectiveService {
  private dataTypeCache = new Map<string, InputObjectTypeDefinitionNode>();
  private relationCache = new Map<string, RelationInfo>();
  private fkColumnCache = new Map<string, string[]>();
  private initializedForPath: string | undefined;

  /** Initialize (or no-op) for the given service config. */
  initialize(serviceConfig: ResolvedDataConnectConfig): void {
    if (this.initializedForPath === serviceConfig.path) {
      return;
    }
    this.invalidateCache();
    this.initializedForPath = serviceConfig.path;
    this.parseGeneratedFiles(serviceConfig.path);
    this.parseUserSchemaFiles(serviceConfig);
  }

  invalidateCache(): void {
    this.dataTypeCache.clear();
    this.relationCache.clear();
    this.fkColumnCache.clear();
    this.initializedForPath = undefined;
  }

  /** Get allowable fields, optionally excluding parent FK in nested _on_ context. */
  getFieldCandidates(
    dataTypeName: string,
    nestedOnFieldName?: string,
  ): AllowableField[] {
    const dataType = this.dataTypeCache.get(dataTypeName);
    if (!dataType?.fields) {
      return [];
    }

    const fkExclusions = nestedOnFieldName
      ? this.getFkColumnsForOnField(nestedOnFieldName)
      : new Set<string>();

    const results: AllowableField[] = [];
    for (const field of dataType.fields) {
      if (hasForbiddenDirective(field) || fkExclusions.has(field.name.value)) {
        continue;
      }
      const isRelational = field.name.value.includes("_on_");
      results.push({
        name: field.name.value,
        typeName: formatTypeNode(field.type),
        description: field.description?.value,
        isRelational,
        childDataTypeName: isRelational
          ? unwrapTypeName(field.type)
          : undefined,
      });
    }
    return results;
  }

  /** Get shallow DB column names only (no _on_ fields). */
  getShallowFields(dataTypeName: string): string[] {
    return this.getFieldCandidates(dataTypeName)
      .filter((f) => !f.isRelational)
      .map((f) => f.name);
  }

  hasDataType(dataTypeName: string): boolean {
    return this.dataTypeCache.has(dataTypeName);
  }

  private parseGeneratedFiles(servicePath: string): void {
    const generatedDir = path.join(servicePath, ".dataconnect", "schema");
    if (!fs.existsSync(generatedDir)) {
      return;
    }

    for (const subdir of listSubdirectories(generatedDir)) {
      const dir = path.join(generatedDir, subdir);
      this.safeParseFile(path.join(dir, "input.gql"), (doc) => {
        for (const def of doc.definitions) {
          if (
            def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION &&
            def.name.value.endsWith("_Data")
          ) {
            this.dataTypeCache.set(def.name.value, def);
          }
        }
      });
      this.safeParseFile(path.join(dir, "relation.gql"), (doc) =>
        this.extractRelations(doc),
      );
    }
  }

  private extractRelations(doc: ReturnType<typeof parse>): void {
    for (const def of doc.definitions) {
      if (def.kind !== Kind.OBJECT_TYPE_EXTENSION || !def.fields) {
        continue;
      }
      for (const field of def.fields) {
        if (!field.name.value.includes("_on_")) {
          continue;
        }
        const fromArg = field.directives
          ?.find((d) => d.name.value === "fdc_generated")
          ?.arguments?.find((a) => a.name.value === "from");
        if (fromArg?.value.kind !== Kind.STRING) {
          continue;
        }
        const [childType, refField] = fromArg.value.value.split(".");
        if (childType && refField) {
          this.relationCache.set(field.name.value, { childType, refField });
        }
      }
    }
  }

  private parseUserSchemaFiles(
    serviceConfig: ResolvedDataConnectConfig,
  ): void {
    const schemaDirs = [
      serviceConfig.mainSchemaDir,
      ...serviceConfig.secondarySchemaDirs,
    ];
    for (const schemaDir of schemaDirs) {
      const absDir = path.join(serviceConfig.path, schemaDir);
      for (const file of findGqlFiles(absDir)) {
        this.safeParseFile(file, (doc) => this.extractRefs(doc));
      }
    }
  }

  /** Extract @ref(fields: [String!]) directives to map FK column names. */
  private extractRefs(doc: ReturnType<typeof parse>): void {
    for (const def of doc.definitions) {
      if (def.kind !== Kind.OBJECT_TYPE_DEFINITION || !def.fields) {
        continue;
      }
      for (const field of def.fields) {
        const fieldsArg = field.directives
          ?.find((d) => d.name.value === "ref")
          ?.arguments?.find((a) => a.name.value === "fields");
        if (fieldsArg?.value.kind !== Kind.LIST) {
          continue;
        }
        const fkColumns = fieldsArg.value.values
          .filter((v): v is { kind: typeof Kind.STRING; value: string } =>
            v.kind === Kind.STRING,
          )
          .map((v) => v.value);
        if (fkColumns.length) {
          this.fkColumnCache.set(
            `${def.name.value}.${field.name.value}`,
            fkColumns,
          );
        }
      }
    }
  }

  /**
   * Resolve FK columns to exclude in a nested _on_ context.
   * Falls back to the default convention (refField + "Id") when no @ref is defined.
   */
  private getFkColumnsForOnField(onFieldName: string): Set<string> {
    const relation = this.relationCache.get(onFieldName);
    if (!relation) {
      return new Set();
    }
    const explicit = this.fkColumnCache.get(
      `${relation.childType}.${relation.refField}`,
    );
    return new Set(explicit ?? [`${relation.refField}Id`]);
  }

  /** Read and parse a .gql file, swallowing errors gracefully. */
  private safeParseFile(
    filePath: string,
    handler: (doc: ReturnType<typeof parse>) => void,
  ): void {
    if (!fs.existsSync(filePath)) {
      return;
    }
    try {
      handler(parse(fs.readFileSync(filePath, "utf-8")));
    } catch {
      // Ignore parse/read failures — generated files may be incomplete.
    }
  }
}

function hasForbiddenDirective(field: InputValueDefinitionNode): boolean {
  return (
    field.directives?.some(
      (d) => d.name.value === "fdc_forbiddenInVariables",
    ) ?? false
  );
}

function formatTypeNode(type: TypeNode): string {
  if (type.kind === Kind.NON_NULL_TYPE) {
    return `${formatTypeNode(type.type)}!`;
  }
  if (type.kind === Kind.LIST_TYPE) {
    return `[${formatTypeNode(type.type)}]`;
  }
  return type.name.value;
}

function listSubdirectories(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function findGqlFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findGqlFiles(fullPath));
    } else if (entry.name.endsWith(".gql")) {
      results.push(fullPath);
    }
  }
  return results;
}
