import { expect } from "chai";

import { AI_LOGIC_ENFORCEMENT_DATE, confirmationForModeChange, isMandatoryFrom } from "./services";

describe("appcheck services confirmation", () => {
  describe("confirmationForModeChange", () => {
    it("asks before enforcing a normal service", () => {
      const q = confirmationForModeChange(
        "firestore.googleapis.com",
        "firestore",
        "UNENFORCED",
        "ENFORCED",
      );
      expect(q).to.match(/will reject requests/);
    });

    it("does not ask when relaxing a normal service", () => {
      expect(
        confirmationForModeChange(
          "firestore.googleapis.com",
          "firestore",
          "ENFORCED",
          "UNENFORCED",
        ),
      ).to.be.null;
      expect(confirmationForModeChange("firestore.googleapis.com", "firestore", "ENFORCED", "OFF"))
        .to.be.null;
    });

    it("asks when relaxing AI Logic, which is enforced by default", () => {
      const q = confirmationForModeChange(
        "firebaseml.googleapis.com",
        "ailogic",
        "ENFORCED",
        "UNENFORCED",
      );
      expect(q).to.match(/mitigate Gemini API abuse/);
    });

    it("does not ask when enforcing AI Logic", () => {
      expect(
        confirmationForModeChange("firebaseml.googleapis.com", "ailogic", "UNENFORCED", "ENFORCED"),
      ).to.be.null;
    });

    it("does not ask when the mode is unchanged", () => {
      expect(
        confirmationForModeChange("firestore.googleapis.com", "firestore", "ENFORCED", "ENFORCED"),
      ).to.be.null;
    });

    it("warns that AI Logic enforcement becomes mandatory, with the date", () => {
      // Firebase enforces App Check for AI Logic from this date and the setting
      // can no longer be turned off, so relaxing it now only works until then.
      for (const mode of ["OFF", "UNENFORCED"] as const) {
        const q = confirmationForModeChange(
          "firebaseml.googleapis.com",
          "ailogic",
          "ENFORCED",
          mode,
        );
        expect(q).to.include(AI_LOGIC_ENFORCEMENT_DATE);
        expect(q).to.match(/cannot be un-enforced for AI Logic/);
      }
    });

    it("does not put the AI Logic deadline in front of other services", () => {
      const q = confirmationForModeChange(
        "firestore.googleapis.com",
        "firestore",
        "UNENFORCED",
        "ENFORCED",
      );
      expect(q).to.not.include(AI_LOGIC_ENFORCEMENT_DATE);
    });
  });

  describe("isMandatoryFrom", () => {
    it("knows which service the deadline applies to", () => {
      expect(isMandatoryFrom("firebaseml.googleapis.com")).to.be.true;
      expect(isMandatoryFrom("firestore.googleapis.com")).to.be.false;
    });
  });
});
