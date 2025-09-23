import { expect } from "chai";
import * as sinon from "sinon";
import { list_users } from "./list_users";
import * as auth from "../../../gcp/auth";
import { toContent } from "../../util";
import { McpContext } from "../../types";

describe("list_users tool", () => {
  const projectId = "test-project";
  const users = [
    { uid: "uid1", email: "user1@example.com", passwordHash: "hash", salt: "salt" },
    { uid: "uid2", email: "user2@example.com", passwordHash: "hash", salt: "salt" },
  ];
  const prunedUsers = [
    { uid: "uid1", email: "user1@example.com" },
    { uid: "uid2", email: "user2@example.com" },
  ];

  let listUsersStub: sinon.SinonStub;

  beforeEach(() => {
    listUsersStub = sinon.stub(auth, "listUsers");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should list users with the default limit", async () => {
    listUsersStub.resolves(users);

    const result = await list_users.fn({}, { projectId } as McpContext);

    expect(listUsersStub).to.be.calledWith(projectId, 100);
    expect(result).to.deep.equal(toContent(prunedUsers));
  });

  it("should list users with a specified limit", async () => {
    listUsersStub.resolves(users);

    const result = await list_users.fn({ limit: 10 }, { projectId } as McpContext);

    expect(listUsersStub).to.be.calledWith(projectId, 10);
    expect(result).to.deep.equal(toContent(prunedUsers));
  });

  it("should handle an empty list of users", async () => {
    listUsersStub.resolves([]);

    const result = await list_users.fn({}, { projectId } as McpContext);

    expect(listUsersStub).to.be.calledWith(projectId, 100);
    expect(result).to.deep.equal(toContent([]));
  });
});
