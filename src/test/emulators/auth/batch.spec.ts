import { expect } from "chai";
import { describeAuthEmulator } from "./setup";
import {
  expectStatusCode,
  PROJECT_ID,
  registerAnonUser,
  registerUser,
} from "./helpers";
import { UserInfo } from "../../../emulator/auth/state";

describeAuthEmulator("accounts:batchGet", ({ authApi }) => {
  it("should allow listing all accounts", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "foobar",
    });

    await authApi()
      .get(
        `/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`
      )
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(2);
        expect(
          res.body.users.map((user: UserInfo) => user.localId)
        ).to.have.members([user1.localId, user2.localId]);

        // No more accounts after this, so no page token returned.
        expect(res.body).not.to.have.property("nextPageToken");
      });
  });

  it("should allow listing all accounts using legacy endpoint", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "foobar",
    });

    await authApi()
      .post(
        "/www.googleapis.com/identitytoolkit/v3/relyingparty/downloadAccount"
      )
      .set("Authorization", "Bearer owner")
      .send({ targetProjectId: PROJECT_ID })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(2);
        expect(
          res.body.users.map((user: UserInfo) => user.localId)
        ).to.have.members([user1.localId, user2.localId]);

        // No more accounts after this, so no page token returned.
        expect(res.body).not.to.have.property("nextPageToken");
      });
  });

  it("should allow specifying maxResults and pagination", async () => {
    const user1 = await registerAnonUser(authApi());
    const user2 = await registerUser(authApi(), {
      email: "foo@example.com",
      password: "foobar",
    });

    const nextPageToken = await authApi()
      .get(
        `/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`
      )
      .query({ maxResults: 1 }) // Give me the first user only.
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].localId).to.equal(
          user1.localId < user2.localId ? user1.localId : user2.localId
        );

        expect(res.body).to.have.property("nextPageToken").which.is.a("string");
        return res.body.nextPageToken as string;
      });

    await authApi()
      .get(
        `/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:batchGet`
      )
      .query({ nextPageToken })
      .set("Authorization", "Bearer owner")
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].localId).to.equal(
          user1.localId > user2.localId ? user1.localId : user2.localId
        );

        // No more accounts after this, so no page token returned.
        expect(res.body).not.to.have.property("nextPageToken");
      });

    // Test the legacy API too to make sure nextPageToken is recognized.
    await authApi()
      .post(
        "/www.googleapis.com/identitytoolkit/v3/relyingparty/downloadAccount"
      )
      .set("Authorization", "Bearer owner")
      .send({ targetProjectId: PROJECT_ID, nextPageToken })
      .then((res) => {
        expectStatusCode(200, res);
        expect(res.body.users).to.have.length(1);
        expect(res.body.users[0].localId).to.equal(
          user1.localId > user2.localId ? user1.localId : user2.localId
        );

        // No more accounts after this, so no page token returned.
        expect(res.body).not.to.have.property("nextPageToken");
      });
  });
});
