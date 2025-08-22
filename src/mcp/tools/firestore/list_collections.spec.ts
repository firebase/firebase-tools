import { expect } from "chai";
import * as sinon from "sinon";
import { list_collections } from "./list_collections";
import * as firestore from "../../../gcp/firestore";
import * as errors from "../../errors";
import { Emulators } from "../../../emulator/types";
import { toContent } from "../../util";

describe("list_collections tool", () => {
  const projectId = "test-project";
  const database = "my-db";
  const collections = ["c1", "c2"];
  const mockHost: any = {
    getEmulatorUrl: sinon.stub(),
  };
  const emulatorUrl = "http://localhost:8080";

  let listCollectionIdsStub: sinon.SinonStub;

  beforeEach(() => {
    listCollectionIdsStub = sinon.stub(firestore, "listCollectionIds");
    mockHost.getEmulatorUrl.withArgs(Emulators.FIRESTORE).resolves(emulatorUrl);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should list collections successfully", async () => {
    listCollectionIdsStub.resolves(collections);

    const result = await (list_collections as any)._fn({ database }, { projectId, host: mockHost });

    expect(listCollectionIdsStub).to.be.calledWith(projectId, database, undefined);
    expect(result).to.deep.equal(toContent(collections));
  });

  it("should return an error if no project ID is provided", async () => {
    const result = await (list_collections as any)._fn(
      {},
      { projectId: undefined, host: mockHost },
    );
    expect(result).to.equal(errors.NO_PROJECT_ERROR);
  });

  it("should use the emulator", async () => {
    listCollectionIdsStub.resolves(collections);
    await (list_collections as any)._fn(
      { use_emulator: true, database },
      { projectId, host: mockHost },
    );
    expect(mockHost.getEmulatorUrl).to.be.calledWith(Emulators.FIRESTORE);
    expect(listCollectionIdsStub).to.be.calledWith(projectId, database, emulatorUrl);
  });
});
