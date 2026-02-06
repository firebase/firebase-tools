import * as clc from "colorette";

import { logger } from "../logger";
import * as utils from "../utils";
import * as validator from "./validator";

import * as types from "./api-types";
import { DatabaseEdition, Density } from "./api-types";
import * as Spec from "./api-spec";
import * as sort from "./api-sort";
import * as util from "./util";
import { confirm } from "../prompt";
import { firestoreOrigin } from "../api";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";
import { PrettyPrint } from "./pretty-print";
import { optionalValueMatches } from "../functional";
import { pollOperation } from "../operation-poller";

export class FirestoreApi {
  apiClient = new Client({ urlPrefix: firestoreOrigin(), apiVersion: "v1" });
  printer = new PrettyPrint();

  /**
   * Process indexes by appending the implicit __name__ fields with default order for STANDARD edition database.
   * No-op if exists __name__ field at the end.
   * No-op is ENTERPRISE edition databases.
   * @param index Spec index to process
   * @return Processed spec index with potential additional __name__ suffix
   */
  public static processIndex(index: Spec.Index): Spec.Index {
    // Per https://firebase.google.com/docs/firestore/query-data/index-overview#default_ordering_and_the_name_field
    // this matches the direction of the last non-name non-vector field in the index.
    let fields = index.fields;
    const suffixOrder: types.Order = FirestoreApi.lastIndexFieldOrder(fields);
    const nameSuffix = { fieldPath: "__name__", order: suffixOrder } as types.IndexField;

    const lastField = index.fields?.[index.fields.length - 1];
    if (lastField.vectorConfig) {
      // lastField is vector field, refer to the second from last field
      const vectorField = lastField;
      fields = fields.slice(0, -1);

      if (fields.length === 0 || fields?.[fields.length - 1].fieldPath !== "__name__") {
        fields.push(nameSuffix);
      }
      fields.push(vectorField);
      return {
        ...index,
        fields,
      };
    }
    if (lastField?.fieldPath !== "__name__") {
      fields.push(nameSuffix);
    }
    return {
      ...index,
      fields,
    };
  }

  public static lastIndexFieldOrder(fields: types.IndexField[]): types.Order {
    let lastIndexFieldOrder: types.Order = types.Order.ASCENDING;
    for (const field of fields) {
      if (field.order) {
        lastIndexFieldOrder = field.order;
      }
    }
    return lastIndexFieldOrder;
  }

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
    databaseId = "(default)",
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

    const database = await this.getDatabase(options.project, databaseId);
    const edition = database.databaseEdition ?? DatabaseEdition.STANDARD;
    const indexesToDelete = existingIndexes.filter((index) => {
      return !indexesToDeploy.some((spec) => this.indexMatchesSpec(index, spec, edition));
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
          .map((x) => this.printer.prettyIndexString(x, false))
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
      const exists = existingIndexes.some((x) => this.indexMatchesSpec(x, index, edition));
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
          .map((x) => this.printer.prettyFieldString(x))
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
  async listIndexes(project: string, databaseId = "(default)"): Promise<types.Index[]> {
    const url = `/projects/${project}/databases/${databaseId}/collectionGroups/-/indexes`;
    const res = await this.apiClient.get<{ indexes?: types.Index[] }>(url);
    const indexes = res.body.indexes;
    if (!indexes) {
      return [];
    }

    return indexes;
  }

  /**
   * List all field configuration overrides defined on the given project.
   * @param project the Firebase project.
   */
  async listFieldOverrides(project: string, databaseId = "(default)"): Promise<types.Field[]> {
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
      return !field.name.includes("__default__");
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
        apiScope: index.apiScope,
        density: index.density,
        multikey: index.multikey,
        unique: index.unique,
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
            apiScope: index.apiScope,
            density: index.density,
            multikey: index.multikey,
            unique: index.unique,
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

    if (index.apiScope) {
      validator.assertEnum(index, "apiScope", Object.keys(types.ApiScope));
    }

    if (index.density) {
      validator.assertEnum(index, "density", Object.keys(types.Density));
    }

    if (index.multikey) {
      validator.assertType("multikey", index.multikey, "boolean");
    }

    if (index.unique !== undefined) {
      validator.assertType("unique", index.unique, "boolean");
      // TODO(b/439901837): Remove this check and update indexMatchesSpec once
      //  unique index configuration is supported.
      throw new FirebaseError("The `unique` index configuration is not supported yet.");
    }

    validator.assertHas(index, "fields");

    index.fields.forEach((field: any) => {
      validator.assertHas(field, "fieldPath");
      validator.assertHasOneOf(field, ["order", "arrayConfig", "vectorConfig"]);

      if (field.order) {
        validator.assertEnum(field, "order", Object.keys(types.Order));
      }

      if (field.arrayConfig) {
        validator.assertEnum(field, "arrayConfig", Object.keys(types.ArrayConfig));
      }

      if (field.vectorConfig) {
        validator.assertType("vectorConfig.dimension", field.vectorConfig.dimension, "number");
        validator.assertHas(field.vectorConfig, "flat");
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

      if (index.apiScope) {
        validator.assertEnum(index, "apiScope", Object.keys(types.ApiScope));
      }

      if (index.density) {
        validator.assertEnum(index, "density", Object.keys(types.Density));
      }

      if (index.multikey) {
        validator.assertType("multikey", index.multikey, "boolean");
      }

      if (index.unique) {
        validator.assertType("unique", index.unique, "boolean");
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
    databaseId = "(default)",
  ): Promise<any> {
    const url = `/projects/${project}/databases/${databaseId}/collectionGroups/${spec.collectionGroup}/fields/${spec.fieldPath}`;

    const indexes = spec.indexes.map((index) => {
      return {
        queryScope: index.queryScope,
        apiScope: index.apiScope,
        density: index.density,
        multikey: index.multikey,
        unique: index.unique,
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
  createIndex(project: string, index: Spec.Index, databaseId = "(default)"): Promise<any> {
    const url = `/projects/${project}/databases/${databaseId}/collectionGroups/${index.collectionGroup}/indexes`;
    return this.apiClient.post(url, {
      fields: index.fields,
      queryScope: index.queryScope,
      apiScope: index.apiScope,
      density: index.density,
      multikey: index.multikey,
      unique: index.unique,
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
   * Returns true if the given ApiScope values match.
   * If either one is undefined, the default value is used for comparison.
   * @param lhs the first ApiScope value.
   * @param rhs the second ApiScope value.
   */
  optionalApiScopeMatches(
    lhs: types.ApiScope | undefined,
    rhs: types.ApiScope | undefined,
  ): boolean {
    return optionalValueMatches<types.ApiScope>(lhs, rhs, types.ApiScope.ANY_API);
  }

  /**
   * Returns true if the given Density values match.
   * If either one is undefined, the default value is used for comparison based on Database Edition.
   * @param lhs the first Density value.
   * @param rhs the second Density value.
   * @param edition the database edition used to determine the default value.
   */
  optionalDensityMatches(
    lhs: Density | undefined,
    rhs: Density | undefined,
    edition: types.DatabaseEdition,
  ): boolean {
    const defaultValue =
      edition === DatabaseEdition.STANDARD ? types.Density.SPARSE_ALL : types.Density.DENSE;
    return optionalValueMatches<types.Density>(lhs, rhs, defaultValue);
  }

  /**
   * Returns true if the given Multikey values match.
   * If either one is undefined, the default value is used for comparison.
   * @param lhs the first Multikey value.
   * @param rhs the second Multikey value.
   */
  optionalMultikeyMatches(lhs: boolean | undefined, rhs: boolean | undefined): boolean {
    const defaultValue = false;
    return optionalValueMatches<boolean>(lhs, rhs, defaultValue);
  }

  /**
   * Determine if an API Index and a Spec Index are functionally equivalent.
   */
  indexMatchesSpec(index: types.Index, spec: Spec.Index, edition: types.DatabaseEdition): boolean {
    const collection = util.parseIndexName(index.name).collectionGroupId;
    if (collection !== spec.collectionGroup) {
      return false;
    }

    if (index.queryScope !== spec.queryScope) {
      return false;
    }

    // apiScope is an optional value and may be missing in firestore.indexes.json,
    // and may also be missing from the server value (when default is picked).
    if (!this.optionalApiScopeMatches(index.apiScope, spec.apiScope)) {
      return false;
    }

    // density is an optional value and may be missing in firestore.indexes.json,
    // and may also be missing from the server value (when default is picked).
    if (!this.optionalDensityMatches(index.density, spec.density, edition)) {
      return false;
    }
    // multikey is an optional value and may be missing in firestore.indexes.json,
    // and may also be missing from the server value (when default is picked).
    if (!this.optionalMultikeyMatches(index.multikey, spec.multikey)) {
      return false;
    }

    // TODO(b/439901837): Compare `unique` index configuration when it's supported.

    let specIdx = spec;
    if (edition === DatabaseEdition.STANDARD) {
      specIdx = FirestoreApi.processIndex(specIdx);
    }

    if (index.fields.length !== specIdx.fields.length) {
      return false;
    }

    let i = 0;
    while (i < index.fields.length) {
      const iField = index.fields[i];
      const sField = specIdx.fields[i];

      if (iField.fieldPath !== sField.fieldPath) {
        return false;
      }

      if (iField.order !== sField.order) {
        return false;
      }

      if (iField.arrayConfig !== sField.arrayConfig) {
        return false;
      }

      // Note: vectorConfig is an object, and using '!==' should not be used.
      if (!utils.deepEqual(iField.vectorConfig, sField.vectorConfig)) {
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
      if (!specModes.includes(mode)) {
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
      const i: any = {
        collectionGroup: index.collectionGroup || index.collectionId,
        queryScope: index.queryScope || types.QueryScope.COLLECTION,
      };

      if (index.apiScope) {
        i.apiScope = index.apiScope;
      }
      if (index.density) {
        i.density = index.density;
      }
      if (index.multikey !== undefined) {
        i.multikey = index.multikey;
      }
      if (index.unique !== undefined) {
        i.unique = index.unique;
      }

      if (index.fields) {
        i.fields = index.fields.map((field: any) => {
          const f: any = {
            fieldPath: field.fieldPath,
          };

          if (field.order) {
            f.order = field.order;
          } else if (field.arrayConfig) {
            f.arrayConfig = field.arrayConfig;
          } else if (field.vectorConfig) {
            f.vectorConfig = field.vectorConfig;
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
   * @param req the request to create a database
   */
  async createDatabase(req: types.CreateDatabaseReq): Promise<types.DatabaseResp> {
    const url = `/projects/${req.project}/databases`;
    const payload: types.DatabaseReq = {
      locationId: req.locationId,
      type: req.type,
      databaseEdition: req.databaseEdition,
      deleteProtectionState: req.deleteProtectionState,
      pointInTimeRecoveryEnablement: req.pointInTimeRecoveryEnablement,
      realtimeUpdatesMode: req.realtimeUpdatesMode,
      firestoreDataAccessMode: req.firestoreDataAccessMode,
      mongodbCompatibleDataAccessMode: req.mongodbCompatibleDataAccessMode,
      cmekConfig: req.cmekConfig,
    };
    const options = { queryParams: { databaseId: req.databaseId } };
    const res = await this.apiClient.post<
      types.DatabaseReq,
      { name: string; response?: types.DatabaseResp }
    >(url, payload, options);
    await pollOperation({
      apiOrigin: firestoreOrigin(),
      apiVersion: "v1",
      operationResourceName: res.body.name,
      masterTimeout: 600000,
    });
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

    return database;
  }

  /**
   * Bulk delete documents from a Firestore database.
   * @param project the Firebase project id.
   * @param databaseId the id of the Firestore Database.
   * @param collectionIds the collection IDs to delete.
   */
  async bulkDeleteDocuments(
    project: string,
    databaseId: string,
    collectionIds: string[],
  ): Promise<types.BulkDeleteDocumentsResponse> {
    const name = `/projects/${project}/databases/${databaseId}`;
    const url = `${name}:bulkDeleteDocuments`;
    const payload: types.BulkDeleteDocumentsRequest = {
      name,
      collectionIds,
    };
    const res = await this.apiClient.post<
      types.BulkDeleteDocumentsRequest,
      types.BulkDeleteDocumentsResponse
    >(url, payload);
    return {
      name: res.body?.name,
    };
  }

  /**
   * Restore a Firestore Database from a backup.
   * @param project the Firebase project id.
   * @param databaseId the ID of the Firestore Database to be restored into
   * @param backupName Name of the backup from which to restore
   * @param encryptionConfig the encryption configuration of the restored database
   */
  async restoreDatabase(
    project: string,
    databaseId: string,
    backupName: string,
    encryptionConfig?: types.EncryptionConfig,
  ): Promise<types.DatabaseResp> {
    const url = `/projects/${project}/databases:restore`;
    const payload: types.RestoreDatabaseReq = {
      databaseId,
      backup: backupName,
      encryptionConfig: encryptionConfig,
    };
    const options = { queryParams: { databaseId: databaseId } };
    const res = await this.apiClient.post<
      types.RestoreDatabaseReq,
      { response?: types.DatabaseResp }
    >(url, payload, options);
    const database = res.body.response;
    if (!database) {
      throw new FirebaseError("Not found");
    }

    return database;
  }

  /**
   * Clone one Firestore Database to another.
   * @param project the source project ID
   * @param pitrSnapshot Source database PITR snapshot specification
   * @param databaseId ID of the target database
   * @param encryptionConfig the encryption configuration of the new database
   */
  async cloneDatabase(
    project: string,
    pitrSnapshot: types.PITRSnapshot,
    databaseId: string,
    encryptionConfig?: types.EncryptionConfig,
  ): Promise<types.Operation> {
    const url = `/projects/${project}/databases:clone`;
    const payload: types.CloneDatabaseReq = {
      databaseId,
      pitrSnapshot,
      encryptionConfig,
    };
    const options = { queryParams: { databaseId: databaseId } };
    const res = await this.apiClient.post<types.CloneDatabaseReq, types.Operation>(
      url,
      payload,
      options,
    );
    const lro = res.body;
    if (!lro) {
      throw new FirebaseError("Not found");
    }

    return lro;
  }

  /**
   * List the long-running Firestore operations.
   * @param project the Firebase project id.
   * @param databaseId the id of the Firestore Database.
   * @param limit The maximum number of operations to list.
   */
  async listOperations(
    project: string,
    databaseId: string,
    limit: number,
  ): Promise<types.ListOperationsResponse> {
    const url = `/projects/${project}/databases/${databaseId}/operations`;
    const res = await this.apiClient.get<types.ListOperationsResponse>(url, {
      queryParams: {
        pageSize: limit,
      },
    });
    return res.body;
  }

  /**
   * Retrieves the information related to the LRO with the given name.
   * @param project the Firebase project id.
   * @param databaseId the id of the Firestore Database.
   * @param operationName the name of the LRO.
   */
  async describeOperation(
    project: string,
    databaseId: string,
    operationName: string,
  ): Promise<types.Operation> {
    const url = `/projects/${project}/databases/${databaseId}/operations/${operationName}`;
    const res = await this.apiClient.get<types.Operation>(url);
    return res.body;
  }

  /**
   * Cancels the LRO with the given name.
   * @param project the Firebase project id.
   * @param databaseId the id of the Firestore Database.
   * @param operationName the name of the LRO.
   */
  async cancelOperation(
    project: string,
    databaseId: string,
    operationName: string,
  ): Promise<{ success: boolean }> {
    const url = `/projects/${project}/databases/${databaseId}/operations/${operationName}:cancel`;
    try {
      const res = await this.apiClient.post<void, void>(url);
      return { success: res.status === 200 };
    } catch (error) {
      // For the cases when the user is trying to cancel an operation that has
      // already completed, the response is not very useful. The error message is
      // "Precondition check failed.". And one has to parse the details of the error
      // stack to find out the real reason. We try to improve the error message here.
      const reason = "Cannot cancel an operation that is completed.";
      const details = (error as any).context?.body?.error?.details || [];
      for (const detail of details) {
        if (detail.detail?.includes(reason)) {
          throw new FirebaseError(reason);
        }
      }
      // If we weren't able to provide a better reason, rethrow the original error.
      throw error;
    }
  }
}
