import * as api from "../api";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as clc from "cli-color";
import * as validator from "./validator";
import { FirestoreIndexApi } from "./indexes";

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
  queryScope: QueryScope;
  fields: IndexField[];
}

export interface IndexSpec {
  version: string;
  indexes: IndexSpecEntry[];
}

export interface Index {
  name: string;
  queryScope: QueryScope;
  fields: IndexField[];
  state: State;
}

export class FirestoreIndexes implements FirestoreIndexApi<Index> {
  public async deploy(project: string, indexes: any[]): Promise<any> {
    indexes.forEach((index) => {
      this.validate(index);
    });

    const toDeploy: IndexSpecEntry[] = indexes;
    const existing = await this.list(project);

    // TODO: Figure out which deployed indexes are missing here
    // TODO: Log the missing ones

    toDeploy.forEach((index) => {
      const exists = existing.some((x) => this.sameSpec(x, index));
      if (exists) {
        logger.debug(`Skipping existing index: ${JSON.stringify(index)}`);
        return;
      }

      logger.debug(`Creating new index: ${JSON.stringify(index)}`);
      // TODO: Actually create
    });
  }

  /**
   * List all indexes that exist on a given project.
   * @param project the Firebase project id.
   */
  public async list(project: string): Promise<Index[]> {
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

  public makeIndexSpec(indexes: Index[]): IndexSpec {
    const indexesJson = indexes.map((index) => {
      return {
        collectionGroup: this.parseIndexName(index.name).collectionGroupId,
        queryScope: index.queryScope,
        fields: index.fields,
      };
    });

    return {
      version: "v1beta2",
      indexes: indexesJson,
    };
  }

  public printIndexes(indexes: Index[], pretty: boolean): void {
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
  public validate(index: any): void {
    validator.assertHas(index, "collectionGroup");
    validator.assertHas(index, "queryScope");
    validator.assertEnum(index, "queryScope", Object.keys(QueryScope));
    validator.assertHas(index, "fields");

    index.fields.forEach((field: any) => {
      validator.assertHas(field, "fieldPath");
      validator.assertHasOneOf(field, ["order", "arrayConfig"]);

      if (field.order) {
        validator.assertEnum(field, "order", Object.keys(Order));
      }

      if (field.arrayConfig) {
        validator.assertEnum(field, "arrayConfig", Object.keys(ArrayConfig));
      }
    });
  }

  /**
   * Get a colored, pretty-printed representation of an index.
   *
   * @param index a Firestore index.
   */
  private toPrettyString(index: Index): string {
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
  private parseIndexName(name: string): any {
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

  /**
   * Determine if an Index and an index specification are functionally equivalent.
   */
  private sameSpec(index: Index, spec: IndexSpecEntry): boolean {
    const collection = this.parseIndexName(index.name).collectionGroupId;
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
