import * as clc from "cli-color";

import * as api from "../api";
import * as FirebaseError from "../error";
import * as logger from "../logger";
import * as validator from "./validator";

import * as API from "./indexes-api";
import * as Spec from "./indexes-spec";

// projects/$PROJECT_ID/databases/(default)/collectionGroups/$COLLECTION_GROUP_ID/indexes/$INDEX_ID
const INDEX_NAME_REGEX = /projects\/([^\/]+?)\/databases\/\(default\)\/collectionGroups\/([^\/]+?)\/indexes\/([^\/]*)/;

// projects/$PROJECT_ID/databases/(default)/collectionGroups/$COLLECTION_GROUP_ID/fields/$FIELD_ID
const FIELD_NAME_REGEX = /projects\/([^\/]+?)\/databases\/\(default\)\/collectionGroups\/([^\/]+?)\/fields\/([^\/]*)/;

interface IndexName {
  projectId: string;
  collectionGroupId: string;
  indexId: string;
}

interface FieldName {
  projectId: string;
  collectionGroupId: string;
  fieldPath: string;
}

export class FirestoreIndexes {
  /**
   * Deploy an index specification to the specified project.
   * @param project the Firebase project ID.
   * @param indexes an array of objects, each will be validated and then converted
   * to an {@link IndexSpecEntry}.
   */
  public async deploy(project: string, indexes: any[], fieldOverrides: any[]): Promise<any> {
    indexes.forEach((index) => {
      this.validateIndex(index);
    });

    fieldOverrides.forEach((field) => {
      this.validateField(field);
    });

    const indexesToDeploy: Spec.Index[] = indexes;
    const fieldOverridesToDeploy: Spec.FieldOverride[] = fieldOverrides;

    const existingIndexes = await this.listIndexes(project);
    const existingFieldOverrides = await this.listFieldOverrides(project);

    // TODO: Figure out which deployed indexes are missing here
    // TODO: Log the missing ones

    indexesToDeploy.forEach(async (index) => {
      const exists = existingIndexes.some((x) => this.indexMatchesSpec(x, index));
      if (exists) {
        logger.debug(`Skipping existing index: ${JSON.stringify(index)}`);
        return;
      }

      logger.debug(`Creating new index: ${JSON.stringify(index)}`);
      await this.createIndex(project, index);
    });

    fieldOverridesToDeploy.forEach(async (field) => {
      const exists = existingFieldOverrides.some((x) => this.fieldMatchesSpec(x, field));
      if (exists) {
        logger.debug(`Skipping existing field override: ${JSON.stringify(field)}`);
        return;
      }

      logger.debug(`Updating field override: ${JSON.stringify(field)}`);
      await this.patchField(project, field);
    });
  }

  /**
   * List all indexes that exist on a given project.
   * @param project the Firebase project id.
   */
  public async listIndexes(project: string): Promise<API.Index[]> {
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

  // TODO
  public async listFieldOverrides(project: string): Promise<API.Field[]> {
    const parent = `projects/${project}/databases/(default)/collectionGroups/-`;
    const url = `${parent}/fields?filter=indexConfig.usesAncestorConfig=false`;

    const res = await api.request("GET", `/v1beta2/${url}`, {
      auth: true,
      origin: api.firestoreOrigin,
    });

    const fields = res.body.fields as API.Field[];

    // Ignore the default config, only list fields.
    return fields.filter((field) => {
      return field.name.indexOf("__default__") < 0;
    });
  }

  /**
   * Turn an array of indexes and field overrides into a {@link Spec.IndexFile} suitable for use
   * in an indexes.json file.
   */
  public makeIndexSpec(indexes: API.Index[], fields: API.Field[] | undefined): Spec.IndexFile {
    const indexesJson = indexes.map((index) => {
      return {
        collectionGroup: this.parseIndexName(index).collectionGroupId,
        queryScope: index.queryScope,
        fields: index.fields,
      };
    });

    if (!fields) {
      logger.debug("No field overrides specified, using [].");
      fields = [];
    }

    const fieldsJson = fields.map((field) => {
      const parsedName = this.parseFieldName(field);
      return {
        collectionGroup: parsedName.collectionGroupId,
        fieldPath: parsedName.fieldPath,

        indexes: field.indexConfig.indexes.map((index) => {
          const firstField = index.fields[0];
          return {
            order: firstField.order,
            arrayConfig: firstField.arrayConfig,
            queryScope: index.queryScope,
          };
        }),
      };
    });

    return {
      indexes: indexesJson,
      fieldOverrides: fieldsJson,
    };
  }

  /**
   * Print an array of indexes to the console.
   * @param indexes the array of indexes.
   */
  public prettyPrintIndexes(indexes: API.Index[]): void {
    indexes.forEach((index) => {
      logger.info(this.prettyIndexString(index));
    });
  }

  /**
   * TODO
   */
  public printFieldOverrides(fields: API.Field[]): void {
    fields.forEach((field) => {
      logger.info(this.prettyFieldString(field));
    });
  }

  /**
   * Validate that an arbitrary object is safe to use as an {@link IndexSpecEntry}.
   */
  public validateIndex(index: any): void {
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

  // TODO
  public validateField(field: any): void {
    validator.assertHas(field, "collectionGroup");
    validator.assertHas(field, "fieldPath");
    validator.assertHas(field, "indexes");

    field.indexes.forEach((index: any) => {
      validator.assertHasOneOf(index, ["arrayConfig", "order"]);

      if (index.arrayConfig) {
        validator.assertEnum(field, "arrayConfig", Object.keys(API.ArrayConfig));
      }

      if (index.order) {
        validator.assertEnum(field, "order", Object.keys(API.Order));
      }

      if (index.queryScope) {
        validator.assertEnum(field, "queryScope", Object.keys(API.QueryScope));
      }
    });
  }

  /**
   * TODO: Doc
   * TODO: Maybe change name of all the indexing functions?
   */
  private async patchField(project: string, spec: Spec.FieldOverride): Promise<any> {
    const url = `projects/${project}/databases/(default)/collectionGroups/${
      spec.collectionGroup
    }/fields/${spec.fieldPath}`;
    const data = {
      // TODO: Scope spec
      queryScope: API.QueryScope.COLLECTION,
      indexConfig: {
        indexes: spec.indexes,
      },
    };

    const res = await api.request("PATCH", `/v1beta2/${url}`, {
      auth: true,
      origin: api.firestoreOrigin,
      data,
    });
  }

  /**
   * Create a new index on the specified project.
   */
  private createIndex(project: string, index: Spec.Index): Promise<any> {
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
  private prettyIndexString(index: API.Index): string {
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
   * Get a colored, pretty-printed representation of a field
   */
  private prettyFieldString(field: API.Field): string {
    let result = "";

    const parsedName = this.parseFieldName(field);

    result +=
      "[" +
      clc.cyan(parsedName.collectionGroupId) +
      "." +
      clc.yellow(parsedName.fieldPath) +
      "] --";

    field.indexConfig.indexes.forEach((index) => {
      const firstField = index.fields[0];
      const mode = firstField.order || firstField.arrayConfig;
      result += " (" + mode + ")";
    });

    return result;
  }

  /**
   * Parse an Index name into useful pieces.
   */
  private parseIndexName(index: API.Index): IndexName {
    if (!index.name) {
      throw new FirebaseError(`Index has no "name": ${JSON.stringify(index)}`);
    }

    const m = index.name.match(INDEX_NAME_REGEX);
    if (!m || m.length < 4) {
      throw new FirebaseError(`Error parsing index name: ${index.name}`);
    }

    return {
      projectId: m[1],
      collectionGroupId: m[2],
      indexId: m[3],
    };
  }

  /**
   * Parse an Field name into useful pieces.
   */
  private parseFieldName(field: API.Field): FieldName {
    if (!field.name) {
      throw new FirebaseError(`Feld has no "name": ${JSON.stringify(field)}`);
    }

    const m = field.name.match(FIELD_NAME_REGEX);
    if (!m || m.length < 4) {
      throw new FirebaseError(`Error parsing field name: ${field.name}`);
    }

    return {
      projectId: m[1],
      collectionGroupId: m[2],
      fieldPath: m[3],
    };
  }

  /**
   * Determine if an API Index and a Spec Index are functionally equivalent.
   */
  private indexMatchesSpec(index: API.Index, spec: Spec.Index): boolean {
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

  /**
   * Determine if an API Field and a Spec Field are functionally equivalent.
   */
  private fieldMatchesSpec(field: API.Field, spec: Spec.FieldOverride): boolean {
    const parsedName = this.parseFieldName(field);

    if (parsedName.collectionGroupId !== spec.collectionGroup) {
      return false;
    }

    if (parsedName.fieldPath !== spec.fieldPath) {
      return false;
    }

    if (field.indexConfig.indexes.length !== spec.indexes.length) {
      return false;
    }

    for (let i = 0; i < spec.indexes.length; i++) {
      const fieldIndex = field.indexConfig.indexes[i];
      const specIndex = spec.indexes[i];

      // TODO: Check that the **SET** of orders/arrayconfigs/queryScopes is the same
    }

    return true;
  }
}
