import * as clc from "cli-color";

import * as api from "../api";
import * as logger from "../logger";
import * as utils from "../utils";
import * as validator from "./validator";

import * as API from "./indexes-api";
import * as Spec from "./indexes-spec";
import * as sort from "./indexes-sort";
import * as util from "./util";

export class FirestoreIndexes {
  /**
   * Deploy an index specification to the specified project.
   * @param project the Firebase project ID.
   * @param indexes an array of objects, each will be validated and then converted
   * to an {@link Spec.Index}.
   * @param fieldOverrides an array of objects, each will be validated and then
   * converted to an {@link Spec.FieldOverride}.
   */
  async deploy(project: string, indexes: any[], fieldOverrides: any[]): Promise<void> {
    const spec = this.upgradeOldSpec({
      indexes,
      fieldOverrides,
    });

    this.validateSpec(spec);

    // Now that the spec is validated we can safely assert these types.
    const indexesToDeploy: Spec.Index[] = spec.indexes;
    const fieldOverridesToDeploy: Spec.FieldOverride[] = spec.fieldOverrides;

    const existingIndexes = await this.listIndexes(project);
    const existingFieldOverrides = await this.listFieldOverrides(project);

    if (existingIndexes.length > indexesToDeploy.length) {
      utils.logBullet(
        clc.bold.cyan("firestore:") +
          " there are some indexes defined in your project that are not present in your " +
          "firestore indexes file. Run firebase firestore:indexes and save the result to correct the discrepancy."
      );
    }

    for (const index of indexesToDeploy) {
      const exists = existingIndexes.some((x) => this.indexMatchesSpec(x, index));
      if (exists) {
        logger.debug(`Skipping existing index: ${JSON.stringify(index)}`);
      } else {
        logger.debug(`Creating new index: ${JSON.stringify(index)}`);
        await this.createIndex(project, index);
      }
    }

    if (existingFieldOverrides.length > fieldOverridesToDeploy.length) {
      utils.logBullet(
        clc.bold.cyan("firestore:") +
          " there are some field overrides defined in your project that are not present in your " +
          "firestore indexes file. Run firebase firestore:indexes and save the result to correct the discrepancy."
      );
    }

    for (const field of fieldOverridesToDeploy) {
      const exists = existingFieldOverrides.some((x) => this.fieldMatchesSpec(x, field));
      if (exists) {
        logger.debug(`Skipping existing field override: ${JSON.stringify(field)}`);
      } else {
        logger.debug(`Updating field override: ${JSON.stringify(field)}`);
        await this.patchField(project, field);
      }
    }
  }

  /**
   * List all indexes that exist on a given project.
   * @param project the Firebase project id.
   */
  async listIndexes(project: string): Promise<API.Index[]> {
    const url = `projects/${project}/databases/(default)/collectionGroups/-/indexes`;

    const res = await api.request("GET", `/v1beta2/${url}`, {
      auth: true,
      origin: api.firestoreOrigin,
    });

    const indexes = res.body.indexes;
    if (!indexes) {
      return [];
    }

    return indexes.map(
      (index: any): API.Index => {
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
        };
      }
    );
  }

  /**
   * List all field configuration overrides defined on the given project.
   * @param project the Firebase project.
   */
  async listFieldOverrides(project: string): Promise<API.Field[]> {
    const parent = `projects/${project}/databases/(default)/collectionGroups/-`;
    const url = `${parent}/fields?filter=indexConfig.usesAncestorConfig=false`;

    const res = await api.request("GET", `/v1beta2/${url}`, {
      auth: true,
      origin: api.firestoreOrigin,
    });

    const fields = res.body.fields as API.Field[];

    // This should never be the case, since the API always returns the __default__
    // configuration, but this is a defensive check.
    if (!fields) {
      return [];
    }

    // Ignore the default config, only list other fields.
    return fields.filter((field) => {
      return field.name.indexOf("__default__") < 0;
    });
  }

  /**
   * Turn an array of indexes and field overrides into a {@link Spec.IndexFile} suitable for use
   * in an indexes.json file.
   */
  makeIndexSpec(indexes: API.Index[], fields?: API.Field[]): Spec.IndexFile {
    const indexesJson = indexes.map((index) => {
      return {
        collectionGroup: util.parseIndexName(index.name).collectionGroupId,
        queryScope: index.queryScope,
        fields: index.fields,
      };
    });

    if (!fields) {
      logger.debug("No field overrides specified, using [].");
      fields = [];
    }

    const fieldsJson = fields.map((field) => {
      const parsedName = util.parseFieldName(field.name);
      const fieldIndexes = field.indexConfig.indexes || [];
      return {
        collectionGroup: parsedName.collectionGroupId,
        fieldPath: parsedName.fieldPath,

        indexes: fieldIndexes.map((index) => {
          const firstField = index.fields[0];
          return {
            order: firstField.order,
            arrayConfig: firstField.arrayConfig,
            queryScope: index.queryScope,
          };
        }),
      };
    });

    const sortedIndexes = indexesJson.sort(sort.compareSpecIndex);
    const sortedFields = fieldsJson.sort(sort.compareFieldOverride);
    return {
      indexes: sortedIndexes,
      fieldOverrides: sortedFields,
    };
  }

  /**
   * Print an array of indexes to the console.
   * @param indexes the array of indexes.
   */
  prettyPrintIndexes(indexes: API.Index[]): void {
    if (indexes.length === 0) {
      logger.info("None");
      return;
    }

    const sortedIndexes = indexes.sort(sort.compareApiIndex);
    sortedIndexes.forEach((index) => {
      logger.info(this.prettyIndexString(index));
    });
  }

  /**
   * Print an array of field overrides to the console.
   * @param fields  the array of field overrides.
   */
  printFieldOverrides(fields: API.Field[]): void {
    if (fields.length === 0) {
      logger.info("None");
      return;
    }

    const sortedFields = fields.sort(sort.compareApiField);
    sortedFields.forEach((field) => {
      logger.info(this.prettyFieldString(field));
    });
  }

  /**
   * Validate that an object is a valid index specification.
   * @param spec the object, normally parsed from JSON.
   */
  validateSpec(spec: any): void {
    validator.assertHas(spec, "indexes");

    spec.indexes.forEach((index: any) => {
      this.validateIndex(index);
    });

    if (spec.fieldOverrides) {
      spec.fieldOverrides.forEach((field: any) => {
        this.validateField(field);
      });
    }
  }

  /**
   * Validate that an arbitrary object is safe to use as an {@link API.Field}.
   */
  validateIndex(index: any): void {
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
   * Validate that an arbitrary object is safe to use as an {@link Spec.FieldOverride}.
   * @param field
   */
  validateField(field: any): void {
    validator.assertHas(field, "collectionGroup");
    validator.assertHas(field, "fieldPath");
    validator.assertHas(field, "indexes");

    field.indexes.forEach((index: any) => {
      validator.assertHasOneOf(index, ["arrayConfig", "order"]);

      if (index.arrayConfig) {
        validator.assertEnum(index, "arrayConfig", Object.keys(API.ArrayConfig));
      }

      if (index.order) {
        validator.assertEnum(index, "order", Object.keys(API.Order));
      }

      if (index.queryScope) {
        validator.assertEnum(index, "queryScope", Object.keys(API.QueryScope));
      }
    });
  }

  /**
   * Update the configuration of a field. Note that this kicks off a long-running
   * operation for index creation/deletion so the update is complete when this
   * method returns.
   * @param project the Firebase project.
   * @param spec the new field override specification.
   */
  async patchField(project: string, spec: Spec.FieldOverride): Promise<any> {
    const url = `projects/${project}/databases/(default)/collectionGroups/${spec.collectionGroup}/fields/${spec.fieldPath}`;

    const indexes = spec.indexes.map((index) => {
      return {
        queryScope: index.queryScope,
        fields: [
          {
            fieldPath: spec.fieldPath,
            arrayConfig: index.arrayConfig,
            order: index.order,
          },
        ],
      };
    });

    const data = {
      indexConfig: {
        indexes,
      },
    };

    await api.request("PATCH", `/v1beta2/${url}`, {
      auth: true,
      origin: api.firestoreOrigin,
      data,
    });
  }

  /**
   * Create a new index on the specified project.
   */
  createIndex(project: string, index: Spec.Index): Promise<any> {
    const url = `projects/${project}/databases/(default)/collectionGroups/${index.collectionGroup}/indexes`;
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
   * Determine if an API Index and a Spec Index are functionally equivalent.
   */
  indexMatchesSpec(index: API.Index, spec: Spec.Index): boolean {
    const collection = util.parseIndexName(index.name).collectionGroupId;
    if (collection !== spec.collectionGroup) {
      return false;
    }

    if (index.queryScope !== spec.queryScope) {
      return false;
    }

    if (index.fields.length !== spec.fields.length) {
      return false;
    }

    let i = 0;
    while (i < index.fields.length) {
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

      i++;
    }

    return true;
  }

  /**
   * Determine if an API Field and a Spec Field are functionally equivalent.
   */
  fieldMatchesSpec(field: API.Field, spec: Spec.FieldOverride): boolean {
    const parsedName = util.parseFieldName(field.name);

    if (parsedName.collectionGroupId !== spec.collectionGroup) {
      return false;
    }

    if (parsedName.fieldPath !== spec.fieldPath) {
      return false;
    }

    const fieldIndexes = field.indexConfig.indexes || [];
    if (fieldIndexes.length !== spec.indexes.length) {
      return false;
    }

    const fieldModes = fieldIndexes.map((index) => {
      const firstField = index.fields[0];
      return firstField.order || firstField.arrayConfig;
    });

    const specModes = spec.indexes.map((index) => {
      return index.order || index.arrayConfig;
    });

    // Confirms that the two objects have the same set of enabled indexes without
    // caring about specification order.
    for (const mode of fieldModes) {
      if (specModes.indexOf(mode) < 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Take a object that may represent an old v1beta1 indexes spec
   * and convert it to the new v1beta2/v1 spec format.
   *
   * This function is meant to be run **before** validation and
   * works on a purely best-effort basis.
   */
  upgradeOldSpec(spec: any): any {
    const result = {
      indexes: [],
      fieldOverrides: spec.fieldOverrides || [],
    };

    if (!(spec.indexes && spec.indexes.length > 0)) {
      return result;
    }

    // Try to detect use of the old API, warn the users.
    if (spec.indexes[0].collectionId) {
      utils.logBullet(
        clc.bold.cyan("firestore:") +
          " your indexes indexes are specified in the v1beta1 API format. " +
          "Please upgrade to the new index API format by running " +
          clc.bold("firebase firestore:indexes") +
          " again and saving the result."
      );
    }

    result.indexes = spec.indexes.map((index: any) => {
      const i = {
        collectionGroup: index.collectionGroup || index.collectionId,
        queryScope: index.queryScope || API.QueryScope.COLLECTION,
        fields: [],
      };

      if (index.fields) {
        i.fields = index.fields.map((field: any) => {
          const f: any = {
            fieldPath: field.fieldPath,
          };

          if (field.order) {
            f.order = field.order;
          } else if (field.arrayConfig) {
            f.arrayConfig = field.arrayConfig;
          } else if (field.mode === API.Mode.ARRAY_CONTAINS) {
            f.arrayConfig = API.ArrayConfig.CONTAINS;
          } else {
            f.order = field.mode;
          }

          return f;
        });
      }

      return i;
    });

    return result;
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

    const nameInfo = util.parseIndexName(index.name);

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

    const parsedName = util.parseFieldName(field.name);

    result +=
      "[" +
      clc.cyan(parsedName.collectionGroupId) +
      "." +
      clc.yellow(parsedName.fieldPath) +
      "] --";

    const fieldIndexes = field.indexConfig.indexes || [];
    if (fieldIndexes.length > 0) {
      fieldIndexes.forEach((index) => {
        const firstField = index.fields[0];
        const mode = firstField.order || firstField.arrayConfig;
        result += ` (${mode})`;
      });
    } else {
      result += " (no indexes)";
    }

    return result;
  }
}
