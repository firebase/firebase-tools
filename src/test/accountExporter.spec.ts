/* eslint-disable @typescript-eslint/no-empty-function */
import { expect } from "chai";
import * as nock from "nock";
import * as os from "os";
import * as sinon from "sinon";

import { validateOptions, serialExportUsers } from "../accountExporter";

describe("accountExporter", () => {
  describe("validateOptions", () => {
    it("should reject when no format provided", () => {
      expect(() => validateOptions({}, "output_file")).to.throw();
    });

    it("should reject when format is not csv or json", () => {
      expect(() => validateOptions({ format: "txt" }, "output_file")).to.throw();
    });

    it("should ignore format param when implicitly specified in file name", () => {
      const ret = validateOptions({ format: "JSON" }, "output_file.csv");
      expect(ret.format).to.eq("csv");
    });

    it("should use format param when not implicitly specified in file name", () => {
      const ret = validateOptions({ format: "JSON" }, "output_file");
      expect(ret.format).to.eq("json");
    });
  });

  describe("serialExportUsers", () => {
    let sandbox: sinon.SinonSandbox;
    let userList: {
      localId: string;
      email: string;
      displayName: string;
      disabled: boolean;
      customAttributes?: string;
    }[] = [];
    const writeStream = {
      write: () => {},
      end: () => {},
    };
    let spyWrite: sinon.SinonSpy;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      spyWrite = sandbox.spy(writeStream, "write");
      for (let i = 0; i < 7; i++) {
        userList.push({
          localId: i.toString(),
          email: "test" + i + "@test.org",
          displayName: "John Tester" + i,
          disabled: i % 2 === 0,
        });
      }
    });

    afterEach(() => {
      sandbox.restore();
      nock.cleanAll();
      userList = [];
    });

    it("should call api.request multiple times for JSON export", async () => {
      mockAllUsersRequests();

      await serialExportUsers("test-project-id", {
        format: "JSON",
        batchSize: 3,
        writeStream: writeStream,
      });
      expect(spyWrite.callCount).to.eq(7);
      expect(spyWrite.getCall(0).args[0]).to.eq(JSON.stringify(userList[0], null, 2));
      for (let j = 1; j < 7; j++) {
        expect(spyWrite.getCall(j).args[0]).to.eq(
          "," + os.EOL + JSON.stringify(userList[j], null, 2),
        );
      }
      expect(nock.isDone()).to.be.true;
    });

    it("should call api.request multiple times for CSV export", async () => {
      mockAllUsersRequests();

      await serialExportUsers("test-project-id", {
        format: "csv",
        batchSize: 3,
        writeStream: writeStream,
      });
      expect(spyWrite.callCount).to.eq(userList.length);
      for (let j = 0; j < userList.length; j++) {
        const expectedEntry =
          userList[j].localId +
          "," +
          userList[j].email +
          ",false,,," +
          userList[j].displayName +
          Array(22).join(",") + // A lot of empty fields...
          userList[j].disabled;
        expect(spyWrite.getCall(j).args[0]).to.eq(expectedEntry + ",," + os.EOL);
      }
      expect(nock.isDone()).to.be.true;
    });

    it("should encapsulate displayNames with commas for csv formats", async () => {
      // Initialize user with comma in display name.
      const singleUser = {
        localId: "1",
        email: "test1@test.org",
        displayName: "John Tester1, CFA",
        disabled: false,
      };
      nock("https://www.googleapis.com")
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 1,
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: [singleUser],
          nextPageToken: "1",
        })
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 1,
          nextPageToken: "1",
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: [],
          nextPageToken: "1",
        });

      await serialExportUsers("test-project-id", {
        format: "csv",
        batchSize: 1,
        writeStream: writeStream,
      });
      expect(spyWrite.callCount).to.eq(1);
      const expectedEntry =
        singleUser.localId +
        "," +
        singleUser.email +
        ",false,,," +
        '"' +
        singleUser.displayName +
        '"' +
        Array(22).join(",") + // A lot of empty fields.
        singleUser.disabled;
      expect(spyWrite.getCall(0).args[0]).to.eq(expectedEntry + ",," + os.EOL);
      expect(nock.isDone()).to.be.true;
    });

    it("should not emit redundant comma in JSON on consecutive calls", async () => {
      mockAllUsersRequests();

      const correctString =
        '{\n  "localId": "0",\n  "email": "test0@test.org",\n  "displayName": "John Tester0",\n  "disabled": true\n}';

      const firstWriteSpy = sinon.spy();
      await serialExportUsers("test-project-id", {
        format: "JSON",
        batchSize: 3,
        writeStream: { write: firstWriteSpy, end: () => {} },
      });
      expect(firstWriteSpy.args[0][0]).to.be.eq(
        correctString,
        "The first call did not emit the correct string",
      );

      mockAllUsersRequests();

      const secondWriteSpy = sinon.spy();
      await serialExportUsers("test-project-id", {
        format: "JSON",
        batchSize: 3,
        writeStream: { write: secondWriteSpy, end: () => {} },
      });
      expect(secondWriteSpy.args[0][0]).to.be.eq(
        correctString,
        "The second call did not emit the correct string",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should export a user's custom attributes for JSON formats", async () => {
      userList[0].customAttributes =
        '{ "customBoolean": true, "customString": "test", "customInt": 99 }';
      userList[1].customAttributes =
        '{ "customBoolean": true, "customString2": "test2", "customInt": 99 }';
      nock("https://www.googleapis.com")
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: userList.slice(0, 3),
        });
      await serialExportUsers("test-project-id", {
        format: "JSON",
        batchSize: 3,
        writeStream: writeStream,
      });
      expect(spyWrite.getCall(0).args[0]).to.eq(JSON.stringify(userList[0], null, 2));
      expect(spyWrite.getCall(1).args[0]).to.eq(
        "," + os.EOL + JSON.stringify(userList[1], null, 2),
      );
      expect(spyWrite.getCall(2).args[0]).to.eq(
        "," + os.EOL + JSON.stringify(userList[2], null, 2),
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should export a user's custom attributes for CSV formats", async () => {
      userList[0].customAttributes =
        '{ "customBoolean": true, "customString": "test", "customInt": 99 }';
      userList[1].customAttributes = '{ "customBoolean": true }';
      nock("https://www.googleapis.com")
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: userList.slice(0, 3),
        });
      await serialExportUsers("test-project-id", {
        format: "JSON",
        batchSize: 3,
        writeStream: writeStream,
      });
      expect(spyWrite.getCall(0).args[0]).to.eq(JSON.stringify(userList[0], null, 2));
      expect(spyWrite.getCall(1).args[0]).to.eq(
        "," + os.EOL + JSON.stringify(userList[1], null, 2),
      );
      expect(spyWrite.getCall(2).args[0]).to.eq(
        "," + os.EOL + JSON.stringify(userList[2], null, 2),
      );
      expect(nock.isDone()).to.be.true;
    });

    function mockAllUsersRequests(): void {
      nock("https://www.googleapis.com")
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: userList.slice(0, 3),
          nextPageToken: "3",
        })
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          nextPageToken: "3",
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: userList.slice(3, 6),
          nextPageToken: "6",
        })
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          nextPageToken: "6",
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: userList.slice(6, 7),
          nextPageToken: "7",
        })
        .post("/identitytoolkit/v3/relyingparty/downloadAccount", {
          maxResults: 3,
          nextPageToken: "7",
          targetProjectId: "test-project-id",
        })
        .reply(200, {
          users: [],
          nextPageToken: "7",
        });
    }
  });
});
