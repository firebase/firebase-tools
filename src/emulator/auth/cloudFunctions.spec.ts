import { expect } from "chai";
import nock from "../../test/helpers/nock";

import { AuthCloudFunction } from "./cloudFunctions";
import { EmulatorRegistry } from "../registry";
import { Emulators } from "../types";
import { FakeEmulator } from "../testing/fakeEmulator";

describe("cloudFunctions", () => {
  describe("dispatch", () => {
    beforeEach(async () => {
      const emu = await FakeEmulator.create(Emulators.FUNCTIONS);
      await EmulatorRegistry.start(emu);
    });

    afterEach(async () => {
      await EmulatorRegistry.stopAll();
      nock.cleanAll();
    });

    it("should dispatch both v1 legacy and v2 CloudEvent requests on create", async () => {
      const functionsUrl = EmulatorRegistry.url(Emulators.FUNCTIONS).toString();
      nock(functionsUrl)
        .post("/functions/projects/project-foo/trigger_multicast", {
          eventId: /.*/,
          eventType: "providers/firebase.auth/eventTypes/user.create",
          resource: {
            name: "projects/project-foo",
            service: "firebaseauth.googleapis.com",
          },
          params: {},
          timestamp: /.*/,
          data: {
            uid: "foobar",
            metadata: {
              creationTime: "2026-01-01T00:00:00.000Z",
              lastSignInTime: "2026-01-02T00:00:00.000Z",
            },
            providerData: [
              {
                rawId: "google-uid-123",
                providerId: "google.com",
                email: "user@example.com",
                displayName: "Test User",
                photoURL: "https://example.com/photo.png",
                federatedId: "fed-123",
              },
            ],
            customClaims: {},
          },
        })
        .reply(200, {});

      nock(functionsUrl)
        .matchHeader("content-type", /application\/cloudevents\+json/)
        .post("/functions/projects/project-foo/trigger_multicast", {
          specversion: "1.0",
          id: /.*/,
          time: /.*/,
          type: "google.firebase.auth.user.v2.created",
          source: "//identitytoolkit.googleapis.com/projects/project-foo",
          subject: "users/foobar",
          data: {
            value: {
              uid: "foobar",
              metadata: {
                createTime: "2026-01-01T00:00:00.000Z",
                lastSignInTime: "2026-01-02T00:00:00.000Z",
              },
              providerData: [
                {
                  uid: "google-uid-123",
                  providerId: "google.com",
                  email: "user@example.com",
                  displayName: "Test User",
                  photoURL: "https://example.com/photo.png",
                },
              ],
              customClaims: {},
            },
          },
        })
        .reply(200, {});

      const cf = new AuthCloudFunction("project-foo");
      await cf.dispatch("create", {
        localId: "foobar",
        createdAt: String(Date.parse("2026-01-01T00:00:00.000Z")),
        lastLoginAt: String(Date.parse("2026-01-02T00:00:00.000Z")),
        providerUserInfo: [
          {
            rawId: "google-uid-123",
            providerId: "google.com",
            email: "user@example.com",
            displayName: "Test User",
            photoUrl: "https://example.com/photo.png",
            federatedId: "fed-123",
          },
        ],
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should dispatch both v1 legacy and v2 CloudEvent with tenantid on delete", async () => {
      const functionsUrl = EmulatorRegistry.url(Emulators.FUNCTIONS).toString();
      nock(functionsUrl)
        .post("/functions/projects/project-foo/trigger_multicast", {
          eventId: /.*/,
          eventType: "providers/firebase.auth/eventTypes/user.delete",
          resource: {
            name: "projects/project-foo",
            service: "firebaseauth.googleapis.com",
          },
          params: {},
          timestamp: /.*/,
          data: {
            uid: "tenant-user",
            tenantId: "tenant-a",
            metadata: {
              creationTime: "2026-01-01T00:00:00.000Z",
            },
            providerData: [
              {
                rawId: "github-uid-456",
                providerId: "github.com",
              },
            ],
            customClaims: {},
          },
        })
        .reply(200, {});

      nock(functionsUrl)
        .matchHeader("content-type", /application\/cloudevents\+json/)
        .post("/functions/projects/project-foo/trigger_multicast", {
          specversion: "1.0",
          id: /.*/,
          time: /.*/,
          type: "google.firebase.auth.user.v2.deleted",
          source: "//identitytoolkit.googleapis.com/projects/project-foo",
          subject: "users/tenant-user",
          tenantid: "tenant-a",
          data: {
            oldValue: {
              uid: "tenant-user",
              metadata: {
                createTime: "2026-01-01T00:00:00.000Z",
              },
              providerData: [
                {
                  uid: "github-uid-456",
                  providerId: "github.com",
                },
              ],
              customClaims: {},
            },
          },
        })
        .reply(200, {});

      const cf = new AuthCloudFunction("project-foo");
      await cf.dispatch("delete", {
        localId: "tenant-user",
        tenantId: "tenant-a",
        createdAt: String(Date.parse("2026-01-01T00:00:00.000Z")),
        lastLoginAt: "not-a-valid-timestamp",
        providerUserInfo: [
          {
            rawId: "github-uid-456",
            providerId: "github.com",
          },
        ],
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should still dispatch v2 CloudEvent if v1 legacy dispatch fails", async () => {
      const functionsUrl = EmulatorRegistry.url(Emulators.FUNCTIONS).toString();
      nock(functionsUrl)
        .post("/functions/projects/project-foo/trigger_multicast", {
          eventType: "providers/firebase.auth/eventTypes/user.create",
          eventId: /.*/,
          resource: /.*/,
          params: {},
          timestamp: /.*/,
          data: { uid: "foobar", metadata: {}, customClaims: {} },
        })
        .replyWithError("v1 network error");

      nock(functionsUrl)
        .matchHeader("content-type", /application\/cloudevents\+json/)
        .post("/functions/projects/project-foo/trigger_multicast", {
          specversion: "1.0",
          id: /.*/,
          time: /.*/,
          type: "google.firebase.auth.user.v2.created",
          source: "//identitytoolkit.googleapis.com/projects/project-foo",
          subject: "users/foobar",
          data: {
            value: { uid: "foobar", metadata: {}, customClaims: {} },
          },
        })
        .reply(200, {});

      const cf = new AuthCloudFunction("project-foo");
      await cf.dispatch("create", {
        localId: "foobar",
        createdAt: "not-a-valid-timestamp",
        lastLoginAt: "99999999999999999",
      });
      expect(nock.isDone()).to.be.true;
    });
  });
}).timeout(2000);
