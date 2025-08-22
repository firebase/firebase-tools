import { expect } from "chai";
import * as sinon from "sinon";
import { query_collection } from "./query_collection";
import * as firestore from "../../../gcp/firestore";
import * as converter from "./converter";
import * as util from "../../util";
import { Emulators } from "../../../emulator/types";
import { toContent } from "../../util";

describe("query_collection tool", () => {
  const projectId = "test-project";
  const collection_path = "my-collection";
  const doc1 = { name: `.../${collection_path}/d1`, fields: {} };
  const jsonDoc1 = { __path__: `${collection_path}/d1` };
  const mockHost: any = {
    getEmulatorUrl: sinon.stub(),
  };

  let queryCollectionStub: sinon.SinonStub;
  let toJsonStub: sinon.SinonStub;
  let toValueStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    queryCollectionStub = sinon.stub(firestore, "queryCollection");
    toJsonStub = sinon.stub(converter, "firestoreDocumentToJson");
    toValueStub = sinon.stub(converter, "convertInputToValue");
    mcpErrorStub = sinon.stub(util, "mcpError");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should perform a simple query", async () => {
    queryCollectionStub.resolves({ documents: [doc1] });
    toJsonStub.returns(jsonDoc1);

    const result = await (query_collection as any)._fn(
      { collection_path },
      { projectId, host: mockHost },
    );

    const expectedQuery = {
      from: [{ collectionId: collection_path, allDescendants: false }],
      limit: 10,
    };
    expect(queryCollectionStub).to.be.calledWith(
      projectId,
      sinon.match(expectedQuery),
      undefined,
      undefined,
    );
    expect(result).to.deep.equal(toContent([jsonDoc1]));
  });

  it("should query with filters and ordering", async () => {
    const filters = [
      {
        field: "field1",
        op: "EQUAL",
        compare_value: { string_value: "value1" },
      },
    ];
    const order = { orderBy: "field2", orderByDirection: "ASCENDING" };
    const firestoreValue = { stringValue: "value1" };
    toValueStub.returns(firestoreValue);
    queryCollectionStub.resolves({ documents: [] });

    await (query_collection as any)._fn(
      { collection_path, filters, order, limit: 5 },
      { projectId, host: mockHost },
    );

    const expectedQuery = {
      from: [{ collectionId: collection_path, allDescendants: false }],
      where: {
        compositeFilter: {
          op: "AND",
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: "field1" },
                op: "EQUAL",
                value: firestoreValue,
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: "field2" }, direction: "ASCENDING" }],
      limit: 5,
    };
    expect(queryCollectionStub).to.be.calledWith(
      projectId,
      sinon.match(expectedQuery),
      undefined,
      undefined,
    );
    expect(toValueStub).to.be.calledWith("value1");
  });

  it("should return an error if collection_path is missing", async () => {
    await (query_collection as any)._fn({} as any, { projectId, host: mockHost });
    expect(mcpErrorStub).to.be.calledWith("Must supply at least one collection path.");
  });

  it("should use the emulator", async () => {
    const emulatorUrl = "http://localhost:8080";
    mockHost.getEmulatorUrl.withArgs(Emulators.FIRESTORE).resolves(emulatorUrl);
    queryCollectionStub.resolves({ documents: [] });

    await (query_collection as any)._fn(
      { collection_path, use_emulator: true },
      { projectId, host: mockHost },
    );

    expect(mockHost.getEmulatorUrl).to.be.calledWith(Emulators.FIRESTORE);
    expect(queryCollectionStub).to.be.calledWith(
      projectId,
      sinon.match.any,
      undefined,
      emulatorUrl,
    );
  });
});
