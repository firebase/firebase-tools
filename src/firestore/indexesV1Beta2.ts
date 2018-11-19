import * as api from "../api";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as clc from "cli-color";
import * as validator from "./validator";
import { FirestoreIndexApi } from "./indexes";

// projects/$PROJECT_ID/databases/(default)/collectionGroups/$COLLECTION_GROUP_ID/indexes/$INDEX_ID
const INDEX_NAME_REGEX = /projects\/([^\/]+?)\/databases\/\(default\)\/collectionGroups\/([^\/]+?)\/indexes\/([^\/]*)/;

// projects/$PROJECT_ID/databases/(default)/collectionGroups/$COLLECTION_GROUP_ID/fields/$FIELD_ID
const FIELD_NAME_REGEX = /projects\/([^\/]+?)\/databases\/\(default\)\/collectionGroups\/([^\/]+?)\/fields\/([^\/]*)/;

/**
 * Type definitions for working with the v1beta2 indexes API. These are direct
 * translations from the protos.
 */
namespace API {
  export enum QueryScope {
    COLLECTION = "COLLECTION",
    COLLECTION_GROUP = "COLLECTION_GROUP",
  }

  export enum Order {
    ASCENDING = "ASCENDING",
    DESCENDING = "DESCENDING",
  }

  export enum ArrayConfig {
    CONTAINS = "CONTAINS",
  }

  export enum State {
    CREATING = "CREATING",
    READY = "READY",
    NEEDS_REPAIR = "NEEDS_REPAIR",
  }

  /**
   * An Index as it is represented in the Firestore v1beta2 indexes API.
   */
  export interface Index {
    name: string | undefined;
    queryScope: QueryScope;
    fields: IndexField[];
    state: State;
  }

  /**
   * A field in an index.
   */
  export interface IndexField {
    fieldPath: string;
    order: Order | undefined;
    arrayConfig: ArrayConfig | undefined;
  }

  /**
   * Represents a single field in the database.
   *
   * If a field has an empty indexConfig, that means all
   * default indexes are exempted.
   */
  export interface Field {
    name: string;
    indexConfig: IndexConfig[];
  }

  /**
   * Index configuration overrides for a field.
   */
  export interface IndexConfig {
    ancestorField: string | undefined;
    indexes: Index[];
  }
}

/**
 * Types that are unique to the CLI, used by the developer to
 * specify indexes in a configuration file.
 */
namespace Spec {
  /**
   * An entry specifying field index configuration override.
   */
  export interface Field {
    collectionGroup: string;
    fieldPath: string;
    indexes: API.Index[]
  }

  /**
   * An entry specifying a compound or other non-default index.
   */
  export interface Index {
    collectionGroup: string;
    queryScope: API.QueryScope;
    fields: API.IndexField[];
  }

  /**
   * Specification for the JSON file that is used for index deployment,
   */
  export interface IndexFile {
    version: string;
    indexes: Spec.Index[];
    fields: Spec.Field[];
  }
}

export class FirestoreIndexes implements FirestoreIndexApi<API.Index> {
  /**
   * Deploy an index specification to the specified project.
   * @param project the Firebase project ID.
   * @param indexes an array of objects, each will be validated and then converted
   * to an {@link IndexSpecEntry}.
   */
  public async deploy(project: string, indexes: any[]): Promise<any> {
    indexes.forEach((index) => {
      this.validate(index);
    });

    const toDeploy: Spec.Index[] = indexes;
    const existing = await this.list(project);

    // TODO: Figure out which deployed indexes are missing here
    // TODO: Log the missing ones

    toDeploy.forEach(async (index) => {
      const exists = existing.some((x) => this.isSameSpec(x, index));
      if (exists) {
        logger.debug(`Skipping existing index: ${JSON.stringify(index)}`);
        return;
      }

      logger.debug(`Creating new index: ${JSON.stringify(index)}`);
      await this.create(project, index);
    });
  }

  /**
   * List all indexes that exist on a given project.
   * @param project the Firebase project id.
   */
  public async list(project: string): Promise<API.Index[]> {
    const url = `projects/${project}/databases/(default)/collectionGroups/-/indexes`;

    const res = await api.request("GET", `/v1beta2/${url}`, {
      auth: true,
      origin: api.firestoreOrigin,
    });

    const indexes = res.body.indexes;
    return indexes.map((index: any) => {
      // Ignore any fields that point at the document ID, as those are implied
      // in all indexes.
      const fields = index.fields.filter((field: API.IndexField) => {
        return field.fieldPath !== "__name__";
      });

      return {
        name: index.name,
        state: index.state,
        queryScope: index.queryScope,
        fields,
      } as API.Index;
    });
  }

  /**
   * Turn an array of indexes into a {@link Spec.IndexFile} suitable for use
   * in an indexes.json file.
   */
  public makeIndexSpec(indexes: API.Index[]): Spec.IndexFile {
    const indexesJson = indexes.map((index) => {
      return {
        collectionGroup: this.parseIndexName(index).collectionGroupId,
        queryScope: index.queryScope,
        fields: index.fields,
      };
    });

    return {
      version: "v1beta2",
      indexes: indexesJson,
      fields: [],
    };
  }

  /**
   * Print an array of indexes to the console.
   * @param indexes the array of indexes.
   * @param pretty if true, pretty prints. If false, print as JSON.
   */
  public printIndexes(indexes: API.Index[], pretty: boolean): void {
    if (!pretty) {
      logger.info(JSON.stringify(this.makeIndexSpec(indexes), undefined, 2));
      return;
    }

    indexes.forEach((index) => {
      logger.info(this.toPrettyString(index));
    });
  }

  /**
   * Validate that an arbitrary object is safe to use as an {@link IndexSpecEntry}.
   */
  public validate(index: any): void {
    validator.assertHas(index, "collectionGroup");
    validator.assertHas(index, "queryScope");
    validator.assertEnum(index, "queryScope", Object.keys(API.QueryScope));
    validator.assertHas(index, "fields");

    index.fields.forEach((field: any) => {
      validator.assertHas(field, "fieldPath");
      validator.assertHasOneOf(field, ["order", "arrayConfig"]);

      if (field.order) {
        validator.assertEnum(field, "order", Object.keys(API.Order));
      }

      if (field.arrayConfig) {
        validator.assertEnum(field, "arrayConfig", Object.keys(API.ArrayConfig));
      }
    });
  }

  /**
   * TODO: Fix type
   */
  private async listFields(project: string): Promise<any> {
    const url = `projects/${project}/databases/(default)/collectionGroups/-/fields?filter=indexConfig.usesAncestorConfig=false`;

    const res = await api.request("GET", `/v1beta2/${url}`, {
      auth: true,
      origin: api.firestoreOrigin,
    });
  }

  /**
   * Create a new index on the specified project.
   */
  private create(project: string, index: Spec.Index): Promise<any> {
    const url = `projects/${project}/databases/(default)/collectionGroups/${
      index.collectionGroup
    }/indexes`;
    return api.request("POST", "/v1beta2/" + url, {
      auth: true,
      data: {
        fields: index.fields,
        queryScope: index.queryScope,
      },
      origin: api.firestoreOrigin,
    });
  }

  /**
   * Get a colored, pretty-printed representation of an index.
   */
  private toPrettyString(index: API.Index): string {
    let result = "";

    if (index.state) {
      const stateMsg = `[${index.state}] `;

      if (index.state === API.State.READY) {
        result += clc.green(stateMsg);
      } else if (index.state === API.State.CREATING) {
        result += clc.yellow(stateMsg);
      } else {
        result += clc.red(stateMsg);
      }
    }

    const nameInfo = this.parseIndexName(index);

    result += clc.cyan(`(${nameInfo.collectionGroupId})`);
    result += " -- ";

    index.fields.forEach((field) => {
      if (field.fieldPath === "__name__") {
        return;
      }

      // Normal field indexes have an "order" while array indexes have an "arrayConfig",
      // we want to display whichever one is present.
      const orderOrArrayConfig = field.order ? field.order : field.arrayConfig;
      result += `(${field.fieldPath},${orderOrArrayConfig}) `;
    });

    return result;
  }

  /**
   * Parse an Index name into useful pieces.
   */
  private parseIndexName(index: API.Index): any {
    if (!index.name) {
      throw new FirebaseError(`Index has no "name": ${JSON.stringify(index)}`);
    }

    const m = index.name.match(INDEX_NAME_REGEX);
    if (!m || m.length < 4) {
      throw new FirebaseError(`Error parsing index name: ${name}`);
    }

    return {
      projectId: m[1],
      collectionGroupId: m[2],
      indexId: m[3],
    };
  }

  /**
   * Determine if an Index and an IndexSpecEntry are functionally equivalent.
   */
  private isSameSpec(index: API.Index, spec: Spec.Index): boolean {
    const collection = this.parseIndexName(index).collectionGroupId;
    if (collection !== spec.collectionGroup) {
      return false;
    }

    if (index.queryScope !== spec.queryScope) {
      return false;
    }

    if (index.fields.length !== spec.fields.length) {
      return false;
    }

    for (let i = 0; i < index.fields.length; i++) {
      const iField = index.fields[i];
      const sField = spec.fields[i];

      if (iField.fieldPath !== sField.fieldPath) {
        return false;
      }

      if (iField.order !== sField.order) {
        return false;
      }

      if (iField.arrayConfig !== sField.arrayConfig) {
        return false;
      }
    }

    return true;
  }
}
