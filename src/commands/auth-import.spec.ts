import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";

import { command } from "./auth-import";
import * as accountImporter from "../accountImporter";
import { FirebaseError } from "../error";
import { Options } from "../options";

describe("auth:import", () => {
  let tmpDir: string;
  let serialImportUsersStub: sinon.SinonStub;

  const actionFn = (
    command as unknown as {
      actionFn: (dataFile: string, options: Options) => Promise<unknown>;
    }
  ).actionFn;

  function fakeOptions(): Options {
    return {
      project: "test-project",
      hashAlgo: "SCRYPT",
      hashKey: "secret",
      saltSeparator: "sep",
      rounds: "8",
      memCost: "14",
    } as unknown as Options;
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "auth-import-test-"));
    serialImportUsersStub = sinon.stub(accountImporter, "serialImportUsers").resolves();
  });

  afterEach(async () => {
    sinon.restore();
    if (tmpDir) {
      await fs.remove(tmpDir);
    }
  });

  it("throws an error if data file does not end with .csv or .json", async () => {
    const filePath = path.join(tmpDir, "users.txt");
    await fs.writeFile(filePath, "hello");

    await expect(actionFn(filePath, fakeOptions())).to.be.rejectedWith(
      FirebaseError,
      "Data file must end with .csv or .json",
    );
  });

  it("successfully parses and imports users from JSON file", async () => {
    const jsonPath = path.join(tmpDir, "users.json");
    const jsonContent = JSON.stringify({
      users: [
        { localId: "user1", email: "user1@example.com" },
        { localId: "user2", email: "user2@example.com" },
      ],
    });
    await fs.writeFile(jsonPath, jsonContent);

    await actionFn(jsonPath, fakeOptions());

    expect(serialImportUsersStub.calledOnce).to.be.true;
    const [, , batches] = serialImportUsersStub.firstCall.args;
    expect(batches).to.have.lengthOf(1);
    expect(batches[0]).to.have.lengthOf(2);
    expect(batches[0][0].localId).to.equal("user1");
    expect(batches[0][1].localId).to.equal("user2");
  });

  it("successfully parses and imports users from CSV file", async () => {
    const csvPath = path.join(tmpDir, "users.csv");
    const csvContent = "user1,user1@example.com\nuser2,user2@example.com\n";
    await fs.writeFile(csvPath, csvContent);

    await actionFn(csvPath, fakeOptions());

    expect(serialImportUsersStub.calledOnce).to.be.true;
    const [, , batches] = serialImportUsersStub.firstCall.args;
    expect(batches).to.have.lengthOf(1);
    expect(batches[0]).to.have.lengthOf(2);
    expect(batches[0][0].localId).to.equal("user1");
    expect(batches[0][1].localId).to.equal("user2");
  });

  it("rejects when JSON file contains invalid user data format", async () => {
    const jsonPath = path.join(tmpDir, "invalid.json");
    const jsonContent = JSON.stringify({
      users: [{ unknownKey: "bad-data" }],
    });
    await fs.writeFile(jsonPath, jsonContent);

    await expect(actionFn(jsonPath, fakeOptions())).to.be.rejectedWith(
      FirebaseError,
      /Validation Error/,
    );
  });
});
