import { expect } from "chai";
import * as sinon from "sinon";
import { delete_document } from "./delete_document";
import * as firestore from "../../../gcp/firestore";
import { FirestoreDelete } from "../../../firestore/delete";
import * as util from "../../util";
import { Emulators } from "../../../emulator/types";

describe("delete_document tool", () => {
  const projectId = "test-project";
  const database = "my-db";
  const path = "my-collection/my-doc";
  const mockHost: any = {
    getEmulatorUrl: sinon.stub(),
  };
  const emulatorUrl = "http://localhost:8080";

  let getDocumentsStub: sinon.SinonStub;
  let firestoreDeleteStub: sinon.SinonStub;
  let mcpErrorStub: sinon.SinonStub;

  beforeEach(() => {
    getDocumentsStub = sinon.stub(firestore, "getDocuments");
    // Stub the execute method on the prototype
    firestoreDeleteStub = sinon.stub(FirestoreDelete.prototype, "execute");
    mcpErrorStub = sinon.stub(util, "mcpError");
    mockHost.getEmulatorUrl.withArgs(Emulators.FIRESTORE).resolves(emulatorUrl);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should delete a document successfully", async () => {
    getDocumentsStub
      .onFirstCall()
      .resolves({ documents: [{ name: path }], missing: [] }) // Pre-delete check
      .onSecondCall()
      .resolves({ documents: [], missing: [path] }); // Post-delete check
    firestoreDeleteStub.resolves();

    const result = await (delete_document as any)._fn(
      { path, database },
      { projectId, host: mockHost },
    );

    expect(firestoreDeleteStub).to.be.calledOnce;
    expect(result).to.deep.equal(
      util.toContent(`Successfully removed document located at : ${path}`),
    );
  });

  it("should return an error if the document does not exist", async () => {
    getDocumentsStub.resolves({ documents: [], missing: [path] });

    await (delete_document as any)._fn({ path, database }, { projectId, host: mockHost });

    expect(mcpErrorStub).to.be.calledWith(
      `None of the specified documents were found in project '${projectId}'`,
    );
  });

  it("should return an error if the deletion fails", async () => {
    getDocumentsStub.resolves({ documents: [{ name: path }], missing: [] }); // Both pre and post checks
    firestoreDeleteStub.resolves();

    await (delete_document as any)._fn({ path, database }, { projectId, host: mockHost });

    expect(mcpErrorStub).to.be.calledWith(`Failed to remove document located at : ${path}`);
  });

  it("should use the emulator URL when specified", async () => {
    getDocumentsStub.resolves({ documents: [], missing: [path] }); // Just to get through the call

    await (delete_document as any)._fn(
      { path, database, use_emulator: true },
      { projectId, host: mockHost },
    );

    expect(mockHost.getEmulatorUrl).to.be.calledWith(Emulators.FIRESTORE);
    expect(getDocumentsStub).to.be.calledWith(projectId, [path], database, emulatorUrl);
  });
});
