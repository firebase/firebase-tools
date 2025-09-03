import * as sinon from "sinon";
import { expect } from "chai";
import { Command } from "../command";
import { command as firestoreBulkDelete } from "./firestore-bulkdelete";
import * as fsi from "../firestore/api";
import { FirebaseError } from "../error";
import * as requireAuthModule from "../requireAuth";
import { BulkDeleteDocumentsResponse } from "../firestore/api-types";

describe("firestore:bulkdelete", () => {
  const PROJECT = "test-project";
  const DATABASE = "test-database";
  const COLLECTION_IDS = ["collection1", "collection2"];

  let command: Command;
  let firestoreApiStub: sinon.SinonStubbedInstance<fsi.FirestoreApi>;
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    command = firestoreBulkDelete;
    firestoreApiStub = sinon.createStubInstance(fsi.FirestoreApi);
    requireAuthStub = sinon.stub(requireAuthModule, "requireAuth");
    sinon.stub(fsi, "FirestoreApi").returns(firestoreApiStub);
    requireAuthStub.resolves("a@b.com");
  });

  afterEach(() => {
    sinon.restore();
  });

  const mockResponse = (name: string): BulkDeleteDocumentsResponse => {
    return {
      name,
    };
  };

  it("should throw an error if collection-ids is not provided", async () => {
    const options = {
      project: PROJECT,
    };

    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      "Missing required flag --collection-ids=[comma separated list of collection groups]",
    );
  });

  it("should call bulkDeleteDocuments with the correct parameters", async () => {
    const options = {
      project: PROJECT,
      collectionIds: COLLECTION_IDS.join(","),
      force: true,
      json: true,
    };
    const expectedResponse = mockResponse("test-operation");
    firestoreApiStub.bulkDeleteDocuments.resolves(expectedResponse);

    const result = await command.runner()(options);

    expect(result).to.deep.equal(expectedResponse);
    expect(
      firestoreApiStub.bulkDeleteDocuments.calledOnceWith(PROJECT, "(default)", COLLECTION_IDS),
    ).to.be.true;
  });

  it("should call bulkDeleteDocuments with the correct database", async () => {
    const options = {
      project: PROJECT,
      database: DATABASE,
      collectionIds: COLLECTION_IDS.join(","),
      force: true,
      json: true,
    };
    const expectedResponse = mockResponse("test-operation");
    firestoreApiStub.bulkDeleteDocuments.resolves(expectedResponse);

    const result = await command.runner()(options);

    expect(result).to.deep.equal(expectedResponse);
    expect(firestoreApiStub.bulkDeleteDocuments.calledOnceWith(PROJECT, DATABASE, COLLECTION_IDS))
      .to.be.true;
  });

  it("should throw an error if the API call fails", async () => {
    const options = {
      project: PROJECT,
      collectionIds: COLLECTION_IDS.join(","),
      force: true,
    };
    const apiError = new Error("API Error");
    firestoreApiStub.bulkDeleteDocuments.rejects(apiError);

    await expect(command.runner()(options)).to.be.rejectedWith(apiError);
  });
});
