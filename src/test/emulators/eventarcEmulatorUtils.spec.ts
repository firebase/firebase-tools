import { expect } from "chai";

import { cloudEventFromProtoToJson } from "../../emulator/eventarcEmulatorUtils";

describe("eventarcEmulatorUtils", () => {
  describe("cloudEventFromProtoToJson", () => {
    it("converts cloud event from proto format", () => {
      expect(
        cloudEventFromProtoToJson({
          "@type": "type.googleapis.com/io.cloudevents.v1.CloudEvent",
          attributes: {
            customattr: {
              ceString: "custom value",
            },
            datacontenttype: {
              ceString: "application/json",
            },
            time: {
              ceTimestamp: "2022-03-16T20:20:42.212Z",
            },
            subject: {
              ceString: "context",
            },
          },
          id: "user-provided-id",
          source: "/my/functions",
          specVersion: "1.0",
          textData: '{"hello":"world"}',
          type: "some.custom.event",
        }),
      ).to.deep.eq({
        type: "some.custom.event",
        specversion: "1.0",
        subject: "context",
        datacontenttype: "application/json",
        id: "user-provided-id",
        data: {
          hello: "world",
        },
        source: "/my/functions",
        time: "2022-03-16T20:20:42.212Z",
        customattr: "custom value",
      });
    });

    it("throws invalid argument when source not set", () => {
      expect(() =>
        cloudEventFromProtoToJson({
          "@type": "type.googleapis.com/io.cloudevents.v1.CloudEvent",
          attributes: {
            customattr: {
              ceString: "custom value",
            },
            datacontenttype: {
              ceString: "application/json",
            },
            time: {
              ceTimestamp: "2022-03-16T20:20:42.212Z",
            },
            subject: {
              ceString: "context",
            },
          },
          id: "user-provided-id",
          specVersion: "1.0",
          textData: '{"hello":"world"}',
          type: "some.custom.event",
        }),
      ).throws("CloudEvent 'source' is required.");
    });

    it("populates converts object data to JSON and sets datacontenttype", () => {
      const got = cloudEventFromProtoToJson({
        "@type": "type.googleapis.com/io.cloudevents.v1.CloudEvent",
        attributes: {
          customattr: {
            ceString: "custom value",
          },
          datacontenttype: {
            ceString: "application/json",
          },
          time: {
            ceTimestamp: "2022-03-16T20:20:42.212Z",
          },
          subject: {
            ceString: "context",
          },
        },
        id: "user-provided-id",
        source: "/my/functions",
        specVersion: "1.0",
        textData: '{"hello":"world"}',
        type: "some.custom.event",
      });
      expect(got.datacontenttype).to.deep.eq("application/json");
      expect(got.data).to.deep.eq({ hello: "world" });
    });

    it("populates string data and sets datacontenttype", () => {
      const got = cloudEventFromProtoToJson({
        "@type": "type.googleapis.com/io.cloudevents.v1.CloudEvent",
        attributes: {
          customattr: {
            ceString: "custom value",
          },
          datacontenttype: {
            ceString: "text/plain",
          },
          time: {
            ceTimestamp: "2022-03-16T20:20:42.212Z",
          },
          subject: {
            ceString: "context",
          },
        },
        id: "user-provided-id",
        source: "/my/functions",
        specVersion: "1.0",
        textData: "hello world",
        type: "some.custom.event",
      });
      expect(got.datacontenttype).to.deep.eq("text/plain");
      expect(got.data).to.eq("hello world");
    });

    it("allows optional attribute to not be set", () => {
      expect(
        cloudEventFromProtoToJson({
          "@type": "type.googleapis.com/io.cloudevents.v1.CloudEvent",
          attributes: {
            customattr: {
              ceString: "custom value",
            },
            datacontenttype: {
              ceString: "application/json",
            },
            time: {
              ceTimestamp: "2022-03-16T20:20:42.212Z",
            },
          },
          id: "user-provided-id",
          source: "/my/functions",
          specVersion: "1.0",
          textData: '{"hello":"world"}',
          type: "some.custom.event",
        }),
      ).to.deep.eq({
        type: "some.custom.event",
        specversion: "1.0",
        datacontenttype: "application/json",
        id: "user-provided-id",
        subject: undefined,
        data: {
          hello: "world",
        },
        source: "/my/functions",
        time: "2022-03-16T20:20:42.212Z",
        customattr: "custom value",
      });
    });
  });
});
