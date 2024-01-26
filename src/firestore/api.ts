import * as clc from "colorette";

import { logger } from "../logger";
import * as utils from "../utils";
import * as validator from "./validator";

import * as types from "./api-types";
import * as Spec from "./api-spec";
import * as sort from "./api-sort";
import * as util from "./util";
import { confirm } from "../prompt";
import { firestoreOrigin } from "../api";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";

export class FirestoreApi {
  apiClient = new Client({ urlPrefix: firestoreOrigin, apiVersion: "v1" });

  /**
   * Deploy an index specification to the specified project.
   * @param options the CLI options.
   * @param indexes an array of objects, each will be validated and then converted
   * to an {@link Spec.Index}.
   * @param fieldOverrides an array of objects, each will be validated and then
   * converted to an {@link Spec.FieldOverride}.
   */
  async deploy(
    options: { project: string; nonInteractive: boolean; force: boolean },
    indexes: any[],
    fieldOverrides: any[],
    databaseId: string = "(default)",
  ): Promise<void> {
    const spec = this.upgradeOldSpec({
      indexes,
      fieldOverrides,
    });

    this.validateSpec(spec);

    // Now that the spec is validated we can safely assert these types.
    const indexesToDeploy: Spec.Index[] = spec.indexes;
    const fieldOverridesToDeploy: Spec.FieldOverride[] = spec.fieldOverrides;

    const existingIndexes: types.Index[] = await this.listIndexes(options.project, databaseId);
    const existingFieldOverrides: types.Field[] = await this.listFieldOverrides(
      options.project,
      databaseId,
    );

    const indexesToDelete = existingIndexes.filter((index) => {
      return !indexesToDeploy.some((spec) => this.indexMatchesSpec(index, spec));
    });

    // We only want to delete fields where there is nothing in the local file with the same
    // (collectionGroup, fieldPath) pair. Otherwise any differences will be resolved
    // as part of the "PATCH" process.
    const fieldOverridesToDelete = existingFieldOverrides.filter((field) => {
      return !fieldOverridesToDeploy.some((spec) => {
        const parsedName = util.parseFieldName(field.name);

        if (parsedName.collectionGroupId !== spec.collectionGroup) {
          return false;
        }

        if (parsedName.fieldPath !== spec.fieldPath) {
          return false;
        }

        return true;
      });
    });

    let shouldDeleteIndexes = options.force;
    if (indexesToDelete.length > 0) {
      if (options.nonInteractive && !options.force) {
        utils.logLabeledBullet(
          "firestore",
          `there are ${indexesToDelete.length} indexes defined in your project that are not present in your ` +
            "firestore indexes file. To delete them, run this command with the --force flag.",
        );
      } else if (!options.force) {
        const indexesString = indexesToDelete
          .map((x) => this.prettyIndexString(x, false))
          .join("\n\t");
        utils.logLabeledBullet(
          "firestore",
          `The following indexes are defined in your project but are not present in your firestore indexes file:\n\t${indexesString}`,
        );
      }

      if (!shouldDeleteIndexes) {
        shouldDeleteIndexes = await confirm({
          nonInteractive: options.nonInteractive,
          force: options.force,
          default: false,
          message:
            "Would you like to delete these indexes? Selecting no will continue the rest of the deployment.",
        });
      }
    }

    for (const index of indexesToDeploy) {
      const exists = existingIndexes.some((x) => this.indexMatchesSpec(x, index));
      if (exists) {
        logger.debug(`Skipping existing index: ${JSON.stringify(index)}`);
      } else {
        logger.debug(`Creating new index: ${JSON.stringify(index)}`);
        await this.createIndex(options.project, index, databaseId);
      }
    }

    if (shouldDeleteIndexes && indexesToDelete.length > 0) {
      utils.logLabeledBullet("firestore", `Deleting ${indexesToDelete.length} indexes...`);
      for (const index of indexesToDelete) {
        await this.deleteIndex(index);
      }
    }

    let shouldDeleteFields = options.force;
    if (fieldOverridesToDelete.length > 0) {
      if (options.nonInteractive && !options.force) {
        utils.logLabeledBullet(
          "firestore",
          `there are ${fieldOverridesToDelete.length} field overrides defined in your project that are not present in your ` +
            "firestore indexes file. To delete them, run this command with the --force flag.",
        );
      } else if (!options.force) {
        const indexesString = fieldOverridesToDelete
          .map((x) => this.prettyFieldString(x))
          .join("\n\t");
        utils.logLabeledBullet(
          "firestore",
          `The following field overrides are defined in your project but are not present in your firestore indexes file:\n\t${indexesString}`,
        );
      }

      if (!shouldDeleteFields) {
        shouldDeleteFields = await confirm({
          nonInteractive: options.nonInteractive,
          force: options.force,
          default: false,
          message:
            "Would you like to delete these field overrides? Selecting no will continue the rest of the deployment.",
        });
      }
    }

    // Disabling TTL must be executed first in case another field is enabled for
    // the same collection in the same deployment.
    const sortedFieldOverridesToDeploy = fieldOverridesToDeploy.sort(sort.compareFieldOverride);
    for (const field of sortedFieldOverridesToDeploy) {
      const exists = existingFieldOverrides.some((x) => this.fieldMatchesSpec(x, field));
      if (exists) {
        logger.debug(`Skipping existing field override: ${JSON.stringify(field)}`);
      } else {
        logger.debug(`Updating field override: ${JSON.stringify(field)}`);
        await this.patchField(options.project, field, databaseId);
      }
    }

    if (shouldDeleteFields && fieldOverridesToDelete.length > 0) {
      utils.logLabeledBullet(
        "firestore",
        `Deleting ${fieldOverridesToDelete.length} field overrides...`,
      );
      for (const field of fieldOverridesToDelete) {
        await this.deleteField(field);
      }
    }
  }

  /**
   * List all indexes that exist on a given project.
   * @param project the Firebase project id.
   */
  async listIndexes(project: string, databaseId: string = "(default)"): Promise<types.Index[]> {
    const url = `/projects/${project}/databases/${databaseId}/collectionGroups/-/indexes`;
    const res = await this.apiClient.get<{ indexes?: types.Index[] }>(url);
    const indexes = res.body.indexes;
    if (!indexes) {
      return [];
    }

    return indexes.map((index: any): types.Index => {
      // Ignore any fields that point at the document ID, as those are implied
      // in all indexes.
      const fields = index.fields.filter((field: types.IndexField) => {
        return field.fieldPath !== "__name__";
      });

      return {
        name: index.name,
        state: index.state,
        queryScope: index.queryScope,
        fields,
      };
    });
  }

  /**
   * List all field configuration overrides defined on the given project.
   * @param project the Firebase project.
   */
  async listFieldOverrides(
    project: string,
    databaseId: string = "(default)",
  ): Promise<types.Field[]> {
    const parent = `projects/${project}/databases/${databaseId}/collectionGroups/-`;
    const url = `/${parent}/fields?filter=indexConfig.usesAncestorConfig=false OR ttlConfig:*`;

    const res = await this.apiClient.get<{ fields?: types.Field[] }>(url);
    const fields = res.body.fields;

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
  makeIndexSpec(indexes: types.Index[], fields?: types.Field[]): Spec.IndexFile {
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
        ttl: !!field.ttlConfig,

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
  prettyPrintIndexes(indexes: types.Index[]): void {
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
   * Print an array of databases to the console as an ASCII table.
   * @param databases the array of Firestore databases.
   */
  prettyPrintDatabases(databases: types.DatabaseResp[]): void {
    if (databases.length === 0) {
      logger.info("No databases found.");
      return;
    }
    const sortedDatabases: types.DatabaseResp[] = databases.sort(sort.compareApiDatabase);
    const Table = require("cli-table");
    const table = new Table({
      head: ["Database Name"],
      colWidths: [Math.max(...sortedDatabases.map((database) => database.name.length + 5), 20)],
    });

    table.push(...sortedDatabases.map((database) => [this.prettyDatabaseString(database)]));
    logger.info(table.toString());
  }

  /**
   * Print important fields of a database to the console as an ASCII table.
   * @param database the Firestore database.
   */
  prettyPrintDatabase(database: types.DatabaseResp): void {
    const Table = require("cli-table");
    const table = new Table({
      head: ["Field", "Value"],
      colWidths: [25, Math.max(50, 5 + database.name.length)],
    });

    table.push(
      ["Name", clc.yellow(database.name)],
      ["Create Time", clc.yellow(database.createTime)],
      ["Last Update Time", clc.yellow(database.updateTime)],
      ["Type", clc.yellow(database.type)],
      ["Location", clc.yellow(database.locationId)],
      ["Delete Protection State", clc.yellow(database.deleteProtectionState)],
      ["Point In Time Recovery", clc.yellow(database.pointInTimeRecoveryEnablement)],
      ["Earliest Version Time", clc.yellow(database.earliestVersionTime)],
      ["Version Retention Period", clc.yellow(database.versionRetentionPeriod)],
    );
    logger.info(table.toString());
  }

  /**
   * Print an array of locations to the console in an ASCII table. Group multi regions together
   *  Example: United States: nam5
   * @param locations the array of locations.
   */
  prettyPrintLocations(locations: types.Location[]): void {
    if (locations.length === 0) {
      logger.info("No Locations Available");
      return;
    }
    const Table = require("cli-table");
    const table = new Table({
      head: ["Display Name", "LocationId"],
      colWidths: [20, 30],
    });

    table.push(
      ...locations
        .sort(sort.compareLocation)
        .map((location) => [location.displayName, location.locationId]),
    );
    logger.info(table.toString());
  }

  /**
   * Print an array of field overrides to the console.
   * @param fields  the array of field overrides.
   */
  printFieldOverrides(fields: types.Field[]): void {
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
   * Validate that an arbitrary object is safe to use as an {@link types.Field}.
   */
  validateIndex(index: any): void {
    validator.assertHas(index, "collectionGroup");
    validator.assertHas(index, "queryScope");
    validator.assertEnum(index, "queryScope", Object.keys(types.QueryScope));

    validator.assertHas(index, "fields");

    index.fields.forEach((field: any) => {
      validator.assertHas(field, "fieldPath");
      validator.assertHasOneOf(field, ["order", "arrayConfig"]);

      if (field.order) {
        validator.assertEnum(field, "order", Object.keys(types.Order));
      }

      if (field.arrayConfig) {
        validator.assertEnum(field, "arrayConfig", Object.keys(types.ArrayConfig));
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

    if (typeof field.ttl !== "undefined") {
      validator.assertType("ttl", field.ttl, "boolean");
    }

    field.indexes.forEach((index: any) => {
      validator.assertHasOneOf(index, ["arrayConfig", "order"]);

      if (index.arrayConfig) {
        validator.assertEnum(index, "arrayConfig", Object.keys(types.ArrayConfig));
      }

      if (index.order) {
        validator.assertEnum(index, "order", Object.keys(types.Order));
      }

      if (index.queryScope) {
        validator.assertEnum(index, "queryScope", Object.keys(types.QueryScope));
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
  async patchField(
    project: string,
    spec: Spec.FieldOverride,
    databaseId: string = "(default)",
  ): Promise<any> {
    const url = `/projects/${project}/databases/${databaseId}/collectionGroups/${spec.collectionGroup}/fields/${spec.fieldPath}`;

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

    let data = {
      indexConfig: {
        indexes,
      },
    };

    if (spec.ttl) {
      data = Object.assign(data, {
        ttlConfig: {},
      });
    }

    if (typeof spec.ttl !== "undefined") {
      await this.apiClient.patch(url, data);
    } else {
      await this.apiClient.patch(url, data, { queryParams: { updateMask: "indexConfig" } });
    }
  }

  /**
   * Delete an existing field overrides on the specified project.
   */
  deleteField(field: types.Field): Promise<any> {
    const url = field.name;
    const data = {};

    return this.apiClient.patch(`/${url}`, data);
  }

  /**
   * Create a new index on the specified project.
   */
  createIndex(project: string, index: Spec.Index, databaseId: string = "(default)"): Promise<any> {
    const url = `/projects/${project}/databases/${databaseId}/collectionGroups/${index.collectionGroup}/indexes`;
    return this.apiClient.post(url, {
      fields: index.fields,
      queryScope: index.queryScope,
    });
  }

  /**
   * Delete an existing index on the specified project.
   */
  deleteIndex(index: types.Index): Promise<any> {
    const url = index.name!;
    return this.apiClient.delete(`/${url}`);
  }

  /**
   * Determine if an API Index and a Spec Index are functionally equivalent.
   */
  indexMatchesSpec(index: types.Index, spec: Spec.Index): boolean {
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
  fieldMatchesSpec(field: types.Field, spec: Spec.FieldOverride): boolean {
    const parsedName = util.parseFieldName(field.name);

    if (parsedName.collectionGroupId !== spec.collectionGroup) {
      return false;
    }

    if (parsedName.fieldPath !== spec.fieldPath) {
      return false;
    }

    if (typeof spec.ttl !== "undefined" && util.booleanXOR(!!field.ttlConfig, spec.ttl)) {
      return false;
    } else if (!!field.ttlConfig && typeof spec.ttl === "undefined") {
      utils.logLabeledBullet(
        "firestore",
        `there are TTL field overrides for collection ${spec.collectionGroup} defined in your project that are not present in your ` +
          "firestore indexes file. The TTL policy won't be deleted since is not specified as false.",
      );
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
   * and convert it to the new v1/v1 spec format.
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
        clc.bold(clc.cyan("firestore:")) +
          " your indexes indexes are specified in the v1beta1 API format. " +
          "Please upgrade to the new index API format by running " +
          clc.bold("firebase firestore:indexes") +
          " again and saving the result.",
      );
    }

    result.indexes = spec.indexes.map((index: any) => {
      const i = {
        collectionGroup: index.collectionGroup || index.collectionId,
        queryScope: index.queryScope || types.QueryScope.COLLECTION,
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
          } else if (field.mode === types.Mode.ARRAY_CONTAINS) {
            f.arrayConfig = types.ArrayConfig.CONTAINS;
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
   * List all databases that exist on a given project.
   * @param project the Firebase project id.
   */
  async listDatabases(project: string): Promise<types.DatabaseResp[]> {
    const url = `/projects/${project}/databases`;
    const res = await this.apiClient.get<{ databases?: types.DatabaseResp[] }>(url);
    const databases = res.body.databases;
    if (!databases) {
      return [];
    }

    return databases;
  }

  /**
   * List all locations that exist on a given project.
   * @param project the Firebase project id.
   */
  async locations(project: string): Promise<types.Location[]> {
    const url = `/projects/${project}/locations`;
    const res = await this.apiClient.get<{ locations?: types.Location[] }>(url);
    const locations = res.body.locations;
    if (!locations) {
      return [];
    }

    return locations;
  }

  /**
   * Get info on a Firestore database.
   * @param project the Firebase project id.
   * @param databaseId the id of the Firestore Database
   */
  async getDatabase(project: string, databaseId: string): Promise<types.DatabaseResp> {
    const url = `/projects/${project}/databases/${databaseId}`;
    const res = await this.apiClient.get<types.DatabaseResp>(url);
    const database = res.body;
    if (!database) {
      throw new FirebaseError("Not found");
    }

    return database;
  }

  /**
   * Create a named Firestore Database
   * @param project the Firebase project id.
   * @param databaseId the name of the Firestore Database
   * @param locationId the id of the region the database will be created in
   * @param type FIRESTORE_NATIVE or DATASTORE_MODE
   * @param deleteProtectionState DELETE_PROTECTION_ENABLED or DELETE_PROTECTION_DISABLED
   * @param pointInTimeRecoveryEnablement POINT_IN_TIME_RECOVERY_ENABLED or POINT_IN_TIME_RECOVERY_DISABLED
   */
  async createDatabase(
    project: string,
    databaseId: string,
    locationId: string,
    type: types.DatabaseType,
    deleteProtectionState: types.DatabaseDeleteProtectionState,
    pointInTimeRecoveryEnablement: types.PointInTimeRecoveryEnablement,
  ): Promise<types.DatabaseResp> {
    const url = `/projects/${project}/databases`;
    const payload: types.DatabaseReq = {
      type,
      locationId,
      deleteProtectionState,
      pointInTimeRecoveryEnablement,
    };
    const options = { queryParams: { databaseId: databaseId } };
    const res = await this.apiClient.post<types.DatabaseReq, { response?: types.DatabaseResp }>(
      url,
      payload,
      options,
    );
    const database = res.body.response;
    if (!database) {
      throw new FirebaseError("Not found");
    }

    return database;
  }

  /**
   * Update a named Firestore Database
   * @param project the Firebase project id.
   * @param databaseId the name of the Firestore Database
   * @param deleteProtectionState DELETE_PROTECTION_ENABLED or DELETE_PROTECTION_DISABLED
   * @param pointInTimeRecoveryEnablement POINT_IN_TIME_RECOVERY_ENABLED or POINT_IN_TIME_RECOVERY_DISABLED
   */
  async updateDatabase(
    project: string,
    databaseId: string,
    deleteProtectionState?: types.DatabaseDeleteProtectionState,
    pointInTimeRecoveryEnablement?: types.PointInTimeRecoveryEnablement,
  ): Promise<types.DatabaseResp> {
    const url = `/projects/${project}/databases/${databaseId}`;
    const payload: types.DatabaseReq = {
      deleteProtectionState,
      pointInTimeRecoveryEnablement,
    };
    const res = await this.apiClient.patch<types.DatabaseReq, { response?: types.DatabaseResp }>(
      url,
      payload,
    );
    const database = res.body.response;
    if (!database) {
      throw new FirebaseError("Not found");
    }

    return database;
  }

  /**
   * Delete a Firestore Database
   * @param project the Firebase project id.
   * @param databaseId the name of the Firestore Database
   */
  async deleteDatabase(project: string, databaseId: string): Promise<types.DatabaseResp> {
    const url = `/projects/${project}/databases/${databaseId}`;
    const res = await this.apiClient.delete<{ response?: types.DatabaseResp }>(url);
    const database = res.body.response;
    if (!database) {
      throw new FirebaseError("Not found");
    }

    return database as types.DatabaseResp;
  }

  /**
   * Get a colored, pretty-printed representation of an index.
   */
  private prettyIndexString(index: types.Index, includeState: boolean = true): string {
    let result = "";

    if (index.state && includeState) {
      const stateMsg = `[${index.state}] `;

      if (index.state === types.State.READY) {
        result += clc.green(stateMsg);
      } else if (index.state === types.State.CREATING) {
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
   * Get a colored, pretty-printed representation of a database
   */
  prettyDatabaseString(database: types.DatabaseResp): string {
    return clc.yellow(database.name);
  }

  /**
   * Get a colored, pretty-printed representation of a field
   */
  private prettyFieldString(field: types.Field): string {
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
    const fieldTtl = field.ttlConfig;
    if (fieldTtl) {
      result += ` TTL(${fieldTtl.state})`;
    }

    return result;
  }
}
