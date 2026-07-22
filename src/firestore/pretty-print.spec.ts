import { expect } from "chai";
import * as sinon from "sinon";
import * as API from "./api-types";
import { PrettyPrint } from "./pretty-print";
import { logger } from "../logger";

const printer = new PrettyPrint();

describe("prettyIndexString", () => {
  it("should correctly print an order type Index", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [
            { fieldPath: "foo", order: API.Order.ASCENDING },
            { fieldPath: "bar", order: API.Order.DESCENDING },
          ],
        },
        false,
      ),
    ).to.contain("(foo,ASCENDING) (bar,DESCENDING) ");
  });

  it("should correctly print a contains type Index", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [
            { fieldPath: "foo", order: API.Order.ASCENDING },
            { fieldPath: "baz", arrayConfig: API.ArrayConfig.CONTAINS },
          ],
        },
        false,
      ),
    ).to.contain("(foo,ASCENDING) (baz,CONTAINS) ");
  });

  it("should correctly print a vector type Index", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [{ fieldPath: "foo", vectorConfig: { dimension: 100, flat: {} } }],
        },
        false,
      ),
    ).to.contain("(foo,VECTOR<100>) ");
  });

  it("should correctly print a vector type Index with other fields", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [
            { fieldPath: "foo", order: API.Order.ASCENDING },
            { fieldPath: "bar", vectorConfig: { dimension: 200, flat: {} } },
          ],
        },
        false,
      ),
    ).to.contain("(foo,ASCENDING) (bar,VECTOR<200>) ");
  });

  it("should correctly print a search type Index", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [{ fieldPath: "foo", searchConfig: {} }],
        },
        false,
      ),
    ).to.contain("(foo,SEARCH) ");
  });

  it("should correctly print a search type Index with other fields", () => {
    expect(
      printer.prettyIndexString(
        {
          name: "/projects/project/databases/(default)/collectionGroups/collectionB/indexes/a",
          queryScope: API.QueryScope.COLLECTION,
          fields: [
            { fieldPath: "foo", order: API.Order.ASCENDING },
            { fieldPath: "bar", searchConfig: {} },
          ],
        },
        false,
      ),
    ).to.contain("(foo,ASCENDING) (bar,SEARCH) ");
  });
});

describe("firebaseConsoleDatabaseUrl", () => {
  it("should provide a console link", () => {
    expect(printer.firebaseConsoleDatabaseUrl("example-project", "example-db")).to.equal(
      "https://console.firebase.google.com/project/example-project/firestore/databases/example-db/data",
    );
  });

  it("should convert (default) to -default-", () => {
    expect(printer.firebaseConsoleDatabaseUrl("example-project", "(default)")).to.equal(
      "https://console.firebase.google.com/project/example-project/firestore/databases/-default-/data",
    );
  });
});

describe("prettyStringArray", () => {
  it("should correctly print an array of strings", () => {
    expect(printer.prettyStringArray(["kms-key-1", "kms-key-2"])).to.equal(
      "kms-key-1\nkms-key-2\n",
    );
  });

  it("should print nothing if the array is empty", () => {
    expect(printer.prettyStringArray([])).to.equal("");
  });
});

describe("database:get", () => {
  let loggerInfoStub: sinon.SinonStub;

  const BASE_DATABASE: API.DatabaseResp = {
    name: "projects/my-project/databases/(default)",
    uid: "uid",
    createTime: "2020-01-01T00:00:00Z",
    updateTime: "2020-01-01T00:00:00Z",
    locationId: "us-central1",
    type: API.DatabaseType.FIRESTORE_NATIVE,
    concurrencyMode: "OPTIMISTIC",
    appEngineIntegrationMode: "ENABLED",
    keyPrefix: "prefix",
    deleteProtectionState: API.DatabaseDeleteProtectionState.DISABLED,
    pointInTimeRecoveryEnablement: API.PointInTimeRecoveryEnablement.DISABLED,
    etag: "etag",
    versionRetentionPeriod: "1h",
    earliestVersionTime: "2020-01-01T00:00:00Z",
    realtimeUpdatesMode: API.RealtimeUpdatesMode.ENABLED,
    firestoreDataAccessMode: API.DataAccessMode.ENABLED,
    mongodbCompatibleDataAccessMode: API.DataAccessMode.DISABLED,
  };

  beforeEach(() => {
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    loggerInfoStub.restore();
  });

  it("should display STANDARD edition when databaseEdition is not provided", () => {
    const database: API.DatabaseResp = { ...BASE_DATABASE };

    printer.prettyPrintDatabase(database);

    expect(loggerInfoStub.firstCall.args[0]).to.include("Edition");
    expect(loggerInfoStub.firstCall.args[0]).to.include("STANDARD");
  });

  it("should display STANDARD edition when databaseEdition is UNSPECIFIED", () => {
    const database: API.DatabaseResp = {
      ...BASE_DATABASE,
      databaseEdition: API.DatabaseEdition.DATABASE_EDITION_UNSPECIFIED,
    };

    printer.prettyPrintDatabase(database);

    expect(loggerInfoStub.firstCall.args[0]).to.include("Edition");
    expect(loggerInfoStub.firstCall.args[0]).to.include("STANDARD");
  });

  it("should display ENTERPRISE edition when databaseEdition is ENTERPRISE", () => {
    const database: API.DatabaseResp = {
      ...BASE_DATABASE,
      databaseEdition: API.DatabaseEdition.ENTERPRISE,
    };

    printer.prettyPrintDatabase(database);

    expect(loggerInfoStub.firstCall.args[0]).to.include("Edition");
    expect(loggerInfoStub.firstCall.args[0]).to.include("ENTERPRISE");
  });

  it("should display STANDARD edition when databaseEdition is STANDARD", () => {
    const database: API.DatabaseResp = {
      ...BASE_DATABASE,
      databaseEdition: API.DatabaseEdition.STANDARD,
    };

    printer.prettyPrintDatabase(database);

    expect(loggerInfoStub.firstCall.args[0]).to.include("Edition");
    expect(loggerInfoStub.firstCall.args[0]).to.include("STANDARD");
  });
});

describe("database:list", () => {
  let loggerInfoStub: sinon.SinonStub;

  const BASE_DATABASE: API.DatabaseResp = {
    name: "projects/my-project/databases/(default)",
    uid: "uid",
    createTime: "2020-01-01T00:00:00Z",
    updateTime: "2020-01-01T00:00:00Z",
    locationId: "us-central1",
    type: API.DatabaseType.FIRESTORE_NATIVE,
    concurrencyMode: "OPTIMISTIC",
    appEngineIntegrationMode: "ENABLED",
    keyPrefix: "prefix",
    deleteProtectionState: API.DatabaseDeleteProtectionState.DISABLED,
    pointInTimeRecoveryEnablement: API.PointInTimeRecoveryEnablement.DISABLED,
    etag: "etag",
    versionRetentionPeriod: "1h",
    earliestVersionTime: "2020-01-01T00:00:00Z",
    realtimeUpdatesMode: API.RealtimeUpdatesMode.ENABLED,
    firestoreDataAccessMode: API.DataAccessMode.ENABLED,
    mongodbCompatibleDataAccessMode: API.DataAccessMode.DISABLED,
  };

  beforeEach(() => {
    loggerInfoStub = sinon.stub(logger, "info");
  });

  afterEach(() => {
    loggerInfoStub.restore();
  });

  it("should display columns for Name, Edition, and Type", () => {
    const databases: API.DatabaseResp[] = [
      {
        ...BASE_DATABASE,
        name: "projects/my-project/databases/db1",
        databaseEdition: API.DatabaseEdition.STANDARD,
      },
    ];

    printer.prettyPrintDatabases(databases);

    expect(loggerInfoStub.firstCall.args[0]).to.include("Database Name");
    expect(loggerInfoStub.firstCall.args[0]).to.include("Edition");
    expect(loggerInfoStub.firstCall.args[0]).to.include("Type");
    expect(loggerInfoStub.firstCall.args[0]).to.include("db1");
    expect(loggerInfoStub.firstCall.args[0]).to.include("STANDARD");
    expect(loggerInfoStub.firstCall.args[0]).to.include("FIRESTORE_NATIVE");
  });

  it("should sort databases by name", () => {
    const databases: API.DatabaseResp[] = [
      {
        ...BASE_DATABASE,
        name: "projects/my-project/databases/z-database",
      },
      {
        ...BASE_DATABASE,
        name: "projects/my-project/databases/a-database",
      },
    ];

    printer.prettyPrintDatabases(databases);

    const logOutput = loggerInfoStub.firstCall.args[0] as string;
    expect(logOutput.indexOf("a-database")).to.be.lessThan(logOutput.indexOf("z-database"));
  });

  it("should show No databases found when list is empty", () => {
    printer.prettyPrintDatabases([]);
    expect(loggerInfoStub.firstCall.args[0]).to.include("No databases found.");
  });

  it("should display DATASTORE_MODE when type is DATASTORE_MODE", () => {
    const databases: API.DatabaseResp[] = [
      {
        ...BASE_DATABASE,
        name: "projects/my-project/databases/db-datastore",
        type: API.DatabaseType.DATASTORE_MODE,
      },
    ];

    printer.prettyPrintDatabases(databases);

    expect(loggerInfoStub.firstCall.args[0]).to.include("db-datastore");
    expect(loggerInfoStub.firstCall.args[0]).to.include("DATASTORE_MODE");
  });
});
