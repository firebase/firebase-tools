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

describe("prettyPrintDatabase", () => {
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
