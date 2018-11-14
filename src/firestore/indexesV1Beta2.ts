import * as api from "../api";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as clc from "cli-color";

// projects/$PROJECT_ID/databases/(default)/collectionGroups/$COLLECTION_GROUP_ID/indexes/$INDEX_ID
const INDEX_NAME_REGEX = /projects\/([^\/]+?)\/databases\/\(default\)\/collectionGroups\/([^\/]+?)\/indexes\/([^\/]*)/;

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

export interface IndexField {
  fieldPath: string;
  order: Order | undefined;
  arrayConfig: ArrayConfig | undefined;
}

export interface IndexSpecEntry {
  collectionGroup: string;
  fields: IndexField[];
}

export interface IndexSpec {
  indexes: IndexSpecEntry[];
}

export interface Index {
  name: string;
  queryScope: QueryScope;
  fields: IndexField[];
  state: State;
}

export class FirestoreIndexes {
  public static makeIndexSpec(indexes: Index[]): IndexSpec {
    // TODO: QueryScope
    const indexesJson = indexes.map((index) => {
      return {
        collectionGroup: this.getCollectionGroup(index),
        fields: index.fields,
      };
    });

    return {
      indexes: indexesJson,
    };
  }

  public static printIndexes(indexes: Index[], pretty: boolean): void {
    if (!pretty) {
      logger.info(JSON.stringify(this.makeIndexSpec(indexes), undefined, 2));
      return;
    }

    indexes.forEach((index) => {
      logger.info(this.toPrettyString(index));
    });
  }

  /**
   * TODO
   */
  public static getCollectionGroup(index: Index): string {
    return this.parseIndexName(index.name).collectionGroupId;
  }

  /**
   * Get a colored, pretty-printed representation of an index.
   *
   * @param index a Firestore index.
   */
  public static toPrettyString(index: Index): string {
    let result = "";

    if (index.state) {
      const stateMsg = `[${index.state}] `;

      if (index.state === State.READY) {
        result += clc.green(stateMsg);
      } else if (index.state === State.CREATING) {
        result += clc.yellow(stateMsg);
      } else {
        result += clc.red(stateMsg);
      }
    }

    const nameInfo = this.parseIndexName(index.name);

    result += clc.cyan(`(${nameInfo.collectionGroupId})`);
    result += " -- ";

    index.fields.forEach((field) => {
      if (field.fieldPath === "__name__") {
        return;
      }

      const orderOrArrayConfig = field.order ? field.order : field.arrayConfig;
      result += `(${field.fieldPath},${orderOrArrayConfig}) `;
    });

    return result;
  }

  /**
   * List all indexes that exist on a given project.
   * @param project the Firebase project id.
   */
  public static async list(project: string): Promise<Index[]> {
    const url = `projects/${project}/databases/(default)/collectionGroups/-/indexes`;

    const res = await api.request("GET", `/v1beta2/${url}`, {
      auth: true,
      origin: api.firestoreOrigin,
    });

    const indexes = res.body.indexes;
    return indexes.map((index: any) => {
      // Ignore any fields that point at the document ID, as those are implied
      // in all indexes.
      const fields = index.fields.filter((field: IndexField) => {
        return field.fieldPath !== "__name__";
      });

      return {
        name: index.name,
        state: index.state,
        queryScope: index.queryScope,
        fields,
      } as Index;
    });
  }

  /**
   * Parse an Index name into useful pieces.
   */
  private static parseIndexName(name: string): any {
    const m = name.match(INDEX_NAME_REGEX);
    if (!m || m.length < 4) {
      throw new FirebaseError(`Error parsing index name: ${name}`);
    }

    return {
      projectId: m[1],
      collectionGroupId: m[2],
      indexId: m[3],
    };
  }
}
