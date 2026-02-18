import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";

import { validateEventFilters, EventFilter, filterToUrlSearchParams } from "./filters";
import { FirebaseError } from "../error";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("filters", () => {
  describe("validateEventFilters", () => {
    it("should not throw for undefined filter", () => {
      expect(() => validateEventFilters(undefined)).to.not.throw();
    });

    it("should not throw for empty filter", () => {
      expect(() => validateEventFilters({} as EventFilter)).to.not.throw();
    });

    describe("deviceDisplayNames validation", () => {
      it("should not throw for valid device display name format", () => {
        const filter: EventFilter = {
          deviceDisplayNames: ["Samsung (Galaxy S21)", "Google (Pixel 6)", "Apple (iPhone 13)"],
        };
        expect(() => validateEventFilters(filter)).to.not.throw();
      });

      it("should throw for invalid device display name without parentheses", () => {
        const filter: EventFilter = {
          deviceDisplayNames: ["Samsung Galaxy S21"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "deviceDisplayNames must match pattern 'manufacturer (device)'",
        );
      });

      it("should throw for invalid device display name with missing manufacturer", () => {
        const filter: EventFilter = {
          deviceDisplayNames: ["(Galaxy S21)"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "deviceDisplayNames must match pattern 'manufacturer (device)'",
        );
      });

      it("should throw for invalid device display name with empty parentheses", () => {
        const filter: EventFilter = {
          deviceDisplayNames: ["Samsung ()"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "deviceDisplayNames must match pattern 'manufacturer (device)'",
        );
      });

      it("should throw when any device display name is invalid", () => {
        const filter: EventFilter = {
          deviceDisplayNames: ["Samsung (Galaxy S21)", "InvalidFormat", "Google (Pixel 6)"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "deviceDisplayNames must match pattern 'manufacturer (device)'",
        );
      });
    });

    describe("operatingSystemDisplayNames validation", () => {
      it("should not throw for valid OS display name format", () => {
        const filter: EventFilter = {
          operatingSystemDisplayNames: ["iOS (15.0)", "Android (12)", "Windows (11)"],
        };
        expect(() => validateEventFilters(filter)).to.not.throw();
      });

      it("should throw for invalid OS display name without parentheses", () => {
        const filter: EventFilter = {
          operatingSystemDisplayNames: ["iOS 15.0"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "operatingSystemDisplayNames must match pattern 'os (version)'",
        );
      });

      it("should throw for invalid OS display name with empty parentheses", () => {
        const filter: EventFilter = {
          operatingSystemDisplayNames: ["iOS ()"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "operatingSystemDisplayNames must match pattern 'os (version)'",
        );
      });
    });

    describe("versionDisplayNames validation", () => {
      it("should not throw for valid version display name format", () => {
        const filter: EventFilter = {
          versionDisplayNames: ["1.0.0 (100)", "2.1.3 (213)", "3.0.0-beta (300)"],
        };
        expect(() => validateEventFilters(filter)).to.not.throw();
      });

      it("should throw for invalid version display name without parentheses", () => {
        const filter: EventFilter = {
          versionDisplayNames: ["1.0.0 build 100"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "versionDisplayNames must match pattern 'version (build)'",
        );
      });

      it("should throw for invalid version display name with missing version", () => {
        const filter: EventFilter = {
          versionDisplayNames: ["(100)"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "versionDisplayNames must match pattern 'version (build)'",
        );
      });

      it("should throw when any version display name is invalid", () => {
        const filter: EventFilter = {
          versionDisplayNames: ["1.0.0 (100)", "InvalidFormat", "2.0.0 (200)"],
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "versionDisplayNames must match pattern 'version (build)'",
        );
      });
    });

    describe("intervalStartTime validation", () => {
      it("should not throw for intervalStartTime within 90 days", () => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const filter: EventFilter = {
          intervalStartTime: thirtyDaysAgo,
        };
        expect(() => validateEventFilters(filter)).to.not.throw();
      });

      it("should not throw for intervalStartTime exactly 89 days ago", () => {
        const eightyNineDaysAgo = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000).toISOString();
        const filter: EventFilter = {
          intervalStartTime: eightyNineDaysAgo,
        };
        expect(() => validateEventFilters(filter)).to.not.throw();
      });

      it("should throw for intervalStartTime more than 90 days in the past", () => {
        const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
        const filter: EventFilter = {
          intervalStartTime: ninetyOneDaysAgo,
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "intervalStartTime must be less than 90 days in the past",
        );
      });

      it("should throw for intervalStartTime 100 days in the past", () => {
        const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
        const filter: EventFilter = {
          intervalStartTime: hundredDaysAgo,
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "intervalStartTime must be less than 90 days in the past",
        );
      });
    });

    describe("customKeys validation", () => {
      it("should not throw for valid custom keys", () => {
        const filter: EventFilter = {
          customKeys: {
            user_tier: "premium",
            feature_flag_x: "enabled",
          },
        };
        expect(() => validateEventFilters(filter)).to.not.throw();
      });

      it("should not throw when customKeys is undefined", () => {
        const filter: EventFilter = {
          issueId: "abc123",
        };
        expect(() => validateEventFilters(filter)).to.not.throw();
      });

      it("should throw for empty string key", () => {
        const filter: EventFilter = {
          customKeys: {
            "": "value",
          },
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "customKeys cannot contain empty string keys",
        );
      });

      it("should throw for whitespace-only key", () => {
        const filter: EventFilter = {
          customKeys: {
            "   ": "value",
          },
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "customKeys cannot contain empty string keys",
        );
      });

      it("should throw for empty string value", () => {
        const filter: EventFilter = {
          customKeys: {
            user_tier: "",
          },
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "customKeys['user_tier'] cannot be an empty string",
        );
      });

      it("should throw for whitespace-only value", () => {
        const filter: EventFilter = {
          customKeys: {
            user_tier: "   ",
          },
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "customKeys['user_tier'] cannot be an empty string",
        );
      });

      it("should throw when any custom key is invalid in a set of multiple keys", () => {
        const filter: EventFilter = {
          customKeys: {
            user_tier: "premium",
            feature_flag_x: "",
            screen_name: "checkout",
          },
        };
        expect(() => validateEventFilters(filter)).to.throw(
          FirebaseError,
          "customKeys['feature_flag_x'] cannot be an empty string",
        );
      });
    });
  });
});

describe("filterToUrlSearchParams", () => {
  describe("customKeys handling", () => {
    it("should convert single custom key to URL parameter", () => {
      const filter: EventFilter = {
        customKeys: {
          user_tier: "premium",
        },
      };
      const params = filterToUrlSearchParams(filter);
      expect(params.get("filter.custom_keys.user_tier")).to.equal("premium");
    });

    it("should convert multiple custom keys to URL parameters", () => {
      const filter: EventFilter = {
        customKeys: {
          user_tier: "premium",
          feature_flag_x: "enabled",
          screen_name: "checkout",
        },
      };
      const params = filterToUrlSearchParams(filter);
      expect(params.get("filter.custom_keys.user_tier")).to.equal("premium");
      expect(params.get("filter.custom_keys.feature_flag_x")).to.equal("enabled");
      expect(params.get("filter.custom_keys.screen_name")).to.equal("checkout");
    });

    it("should handle customKeys with other filter fields", () => {
      const filter: EventFilter = {
        issueId: "abc123",
        intervalStartTime: "2025-01-01T00:00:00Z",
        customKeys: {
          user_tier: "premium",
        },
      };
      const params = filterToUrlSearchParams(filter);
      expect(params.get("filter.issue.id")).to.equal("abc123");
      expect(params.get("filter.interval.start_time")).to.equal("2025-01-01T00:00:00Z");
      expect(params.get("filter.custom_keys.user_tier")).to.equal("premium");
    });

    it("should not add custom key parameters when customKeys is undefined", () => {
      const filter: EventFilter = {
        issueId: "abc123",
      };
      const params = filterToUrlSearchParams(filter);
      expect(params.get("filter.issue.id")).to.equal("abc123");
      expect(params.toString()).to.not.include("filter.custom_keys");
    });

    it("should not add custom key parameters when customKeys is empty", () => {
      const filter: EventFilter = {
        issueId: "abc123",
        customKeys: {},
      };
      const params = filterToUrlSearchParams(filter);
      expect(params.get("filter.issue.id")).to.equal("abc123");
      expect(params.toString()).to.not.include("filter.custom_keys");
    });
  });
});
