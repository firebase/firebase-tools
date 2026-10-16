import { expect } from "chai";

import { FirebaseError } from "../error";
import {
  aliasForServiceId,
  assertReplayProtectionAllowed,
  displayNameForServiceId,
  formatEnforcementMode,
  formatUpdateTime,
  isAutoEnforcedService,
  parseEnforcementMode,
  resolveServiceId,
} from "./services";

describe("appcheck services helpers", () => {
  describe("resolveServiceId", () => {
    it("resolves the short names", () => {
      expect(resolveServiceId("firestore")).to.equal("firestore.googleapis.com");
      expect(resolveServiceId("auth")).to.equal("identitytoolkit.googleapis.com");
      expect(resolveServiceId("database")).to.equal("firebasedatabase.googleapis.com");
      expect(resolveServiceId("storage")).to.equal("firebasestorage.googleapis.com");
      expect(resolveServiceId("dataconnect")).to.equal("firebasedataconnect.googleapis.com");
    });

    it("resolves ailogic to firebaseml, not firebasevertexai", () => {
      // An App Check service id names a service to App Check; it is not the API
      // host. AI Logic talks to firebasevertexai, but App Check knows it as
      // firebaseml, and firebasevertexai is rejected as "Service not supported".
      expect(resolveServiceId("ailogic")).to.equal("firebaseml.googleapis.com");
    });

    it("passes through a full service id", () => {
      expect(resolveServiceId("firestore.googleapis.com")).to.equal("firestore.googleapis.com");
      expect(resolveServiceId("maps-backend.googleapis.com")).to.equal(
        "maps-backend.googleapis.com",
      );
    });

    it("rejects an unknown service and lists the valid ones by product name", () => {
      // cloudfunctions is not an App Check service; the API answers 400.
      expect(() => resolveServiceId("functions")).to.throw(FirebaseError, /Unknown service/);
      // The list a developer sees is short names and product names, never ids.
      expect(() => resolveServiceId("cloudfunctions.googleapis.com")).to.throw(
        FirebaseError,
        /firestore {5}Cloud Firestore/,
      );
      expect(() => resolveServiceId("nope")).to.not.throw(/googleapis\.com/);
    });

    it("shows product names, not service ids", () => {
      expect(displayNameForServiceId("firebaseml.googleapis.com")).to.equal("Firebase AI Logic");
      expect(displayNameForServiceId("identitytoolkit.googleapis.com")).to.equal(
        "Firebase Authentication",
      );
      // Services with no alias still get their documented name.
      expect(displayNameForServiceId("maps-backend.googleapis.com")).to.equal(
        "Maps JavaScript API",
      );
      // Anything unknown falls back to the id rather than showing nothing.
      expect(displayNameForServiceId("something.googleapis.com")).to.equal(
        "something.googleapis.com",
      );
    });
  });

  describe("aliasForServiceId", () => {
    it("maps back to the short name, or keeps the id", () => {
      expect(aliasForServiceId("firebaseml.googleapis.com")).to.equal("ailogic");
      expect(aliasForServiceId("places.googleapis.com")).to.equal("places.googleapis.com");
    });
  });

  describe("parseEnforcementMode", () => {
    it("accepts the three modes in any case", () => {
      expect(parseEnforcementMode("off")).to.equal("OFF");
      expect(parseEnforcementMode("Unenforced")).to.equal("UNENFORCED");
      expect(parseEnforcementMode("ENFORCED")).to.equal("ENFORCED");
    });

    it("rejects anything else", () => {
      expect(() => parseEnforcementMode("on")).to.throw(FirebaseError, /Unknown mode: on/);
      expect(() => parseEnforcementMode("")).to.throw(FirebaseError);
    });
  });

  describe("assertReplayProtectionAllowed", () => {
    it("allows equal or weaker replay protection", () => {
      expect(() => assertReplayProtectionAllowed("ENFORCED", "ENFORCED")).to.not.throw();
      expect(() => assertReplayProtectionAllowed("ENFORCED", "UNENFORCED")).to.not.throw();
      expect(() => assertReplayProtectionAllowed("UNENFORCED", "OFF")).to.not.throw();
    });

    it("rejects replay protection stronger than the baseline", () => {
      expect(() => assertReplayProtectionAllowed("UNENFORCED", "ENFORCED")).to.throw(
        FirebaseError,
        /cannot be stronger/,
      );
      expect(() => assertReplayProtectionAllowed("OFF", "UNENFORCED")).to.throw(FirebaseError);
    });
  });

  describe("isAutoEnforcedService", () => {
    it("knows AI Logic is enforced by default", () => {
      expect(isAutoEnforcedService("firebaseml.googleapis.com")).to.be.true;
      expect(isAutoEnforcedService("firestore.googleapis.com")).to.be.false;
    });
  });

  describe("display helpers", () => {
    it("shows a missing mode as Off", () => {
      // The API omits enforcementMode when it is OFF, because OFF is the zero
      // value of the enum.
      expect(formatEnforcementMode(undefined)).to.equal("Off");
      expect(formatEnforcementMode("ENFORCED")).to.equal("Enforced");
      expect(formatEnforcementMode("UNENFORCED")).to.equal("Unenforced");
    });

    it("shows the epoch update time of a never configured service as never", () => {
      expect(formatUpdateTime("1970-01-01T00:00:00Z")).to.equal("never");
      expect(formatUpdateTime(undefined)).to.equal("never");
      expect(formatUpdateTime("2026-07-20T04:04:21Z")).to.equal("2026-07-20T04:04:21Z");
    });
  });
});
