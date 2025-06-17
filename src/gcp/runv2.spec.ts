import { expect } from "chai";

import * as runv2 from "./runv2";
import * as backend from "../deploy/functions/backend";
import { latest, Runtime } from "../deploy/functions/runtimes/supported";
import { CODEBASE_LABEL } from "../functions/constants";

describe("runv2", () => {
  const PROJECT_ID = "project-id";
  const LOCATION = "us-central1";
  const SERVICE_ID = "functionid"; // TODO: use other normalization method if/when implemented.
  const FUNCTION_ID = "functionId"; // Logical function ID
  const IMAGE_URI = "gcr.io/project/image:latest";

  const BASE_ENDPOINT_RUN: Omit<backend.Endpoint, "httpsTrigger"> = {
    platform: "run",
    id: FUNCTION_ID,
    project: PROJECT_ID,
    region: LOCATION,
    entryPoint: FUNCTION_ID,
    runtime: latest("nodejs"),
    availableMemoryMb: 256,
    cpu: 1,
  };

  const RUN_SERVICE_V2_OUTPUT_BASE: runv2.Service = {
    name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${SERVICE_ID}`,
    generation: 1,
    labels: {
      [runv2.RUNTIME_LABEL]: latest("nodejs"),
      [runv2.CLIENT_NAME_LABEL]: "firebase-functions",
    },
    annotations: {
      [runv2.CLIENT_NAME_ANNOTATION]: "cli-firebase",
      [runv2.FUNCTION_TARGET_ANNOTATION]: FUNCTION_ID,
      [runv2.FUNCTION_ID_ANNOTATION]: FUNCTION_ID,
      [runv2.CPU_BOOST_ANNOTATION]: "true",
    },
    template: {
      containers: [
        {
          name: runv2.DEFAULT_FUNCTION_CONTAINER_NAME,
          image: IMAGE_URI,
          env: [],
          resources: {
            limits: {
              cpu: "1",
              memory: "256Mi",
            },
            startupCpuBoost: true,
          },
        },
      ],
      containerConcurrency: backend.DEFAULT_CONCURRENCY, // Default for CPU >= 1
    },
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
    creator: "test@example.com",
    lastModifier: "test@example.com",
    etag: "test-etag",
  };

  const RUN_SERVICE_V2_INPUT_BASE: Omit<runv2.Service, runv2.ServiceOutputFields> = {
    name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${SERVICE_ID}`,
    labels: {
      [runv2.RUNTIME_LABEL]: latest("nodejs"),
      [runv2.CLIENT_NAME_LABEL]: "firebase-functions",
    },
    annotations: {
      [runv2.CLIENT_NAME_ANNOTATION]: "cli-firebase",
      [runv2.FUNCTION_TARGET_ANNOTATION]: FUNCTION_ID,
      [runv2.FUNCTION_ID_ANNOTATION]: FUNCTION_ID,
      [runv2.CPU_BOOST_ANNOTATION]: "true",
    },
    template: {
      containers: [
        {
          name: runv2.DEFAULT_FUNCTION_CONTAINER_NAME,
          image: IMAGE_URI,
          env: [],
          resources: {
            limits: {
              cpu: "1",
              memory: "256Mi",
            },
            startupCpuBoost: true,
          },
        },
      ],
      containerConcurrency: backend.DEFAULT_CONCURRENCY,
    },
  };

  describe("serviceFromEndpoint", () => {
    it("should copy a minimal endpoint", () => {
      const endpoint: backend.Endpoint = {
        ...BASE_ENDPOINT_RUN,
        httpsTrigger: {},
      };

      expect(runv2.serviceFromEndpoint(endpoint, IMAGE_URI)).to.deep.equal(RUN_SERVICE_V2_INPUT_BASE);
    });

    it("should handle different codebase", () => {
      const endpoint: backend.Endpoint = {
        ...BASE_ENDPOINT_RUN,
        codebase: "my-codebase",
        httpsTrigger: {},
      };
      const expectedServiceInput: Omit<runv2.Service, runv2.ServiceOutputFields> = {
        ...RUN_SERVICE_V2_INPUT_BASE,
        name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${FUNCTION_ID.toLowerCase()}`,
        labels: {
          ...RUN_SERVICE_V2_INPUT_BASE.labels,
          [CODEBASE_LABEL]: "my-codebase",
        },
      };
      expect(runv2.serviceFromEndpoint(endpoint, IMAGE_URI)).to.deep.equal(expectedServiceInput);
    });

    it("should copy environment variables", () => {
      const endpoint: backend.Endpoint = {
        ...BASE_ENDPOINT_RUN,
        httpsTrigger: {},
        environmentVariables: { FOO: "bar" },
      };
      const expectedServiceInput = JSON.parse(
        JSON.stringify({
          ...RUN_SERVICE_V2_INPUT_BASE,
          name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${FUNCTION_ID.toLowerCase()}`,
        }),
      );
      expectedServiceInput.template.containers[0].env = [{ name: "FOO", value: "bar" }];

      expect(runv2.serviceFromEndpoint(endpoint, IMAGE_URI)).to.deep.equal(expectedServiceInput);
    });

    it("should copy secret environment variables", () => {
      const endpoint: backend.Endpoint = {
        ...BASE_ENDPOINT_RUN,
        httpsTrigger: {},
        secretEnvironmentVariables: [
          { key: "MY_SECRET", secret: "secret-name", projectId: PROJECT_ID, version: "1" },
        ],
      };
      const expectedServiceInput = JSON.parse(
        JSON.stringify({
          ...RUN_SERVICE_V2_INPUT_BASE,
          name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${FUNCTION_ID.toLowerCase()}`,
        }),
      );
      expectedServiceInput.template.containers[0].env = [
        {
          name: "MY_SECRET",
          valueSource: { secretKeyRef: { secret: "secret-name", version: "1" } },
        },
      ];
      expect(runv2.serviceFromEndpoint(endpoint, IMAGE_URI)).to.deep.equal(expectedServiceInput);
    });

    it("should set min/max instances annotations", () => {
      const endpoint: backend.Endpoint = {
        ...BASE_ENDPOINT_RUN,
        httpsTrigger: {},
        minInstances: 1,
        maxInstances: 10,
      };
      const expectedServiceInput = JSON.parse(
        JSON.stringify({
          ...RUN_SERVICE_V2_INPUT_BASE,
          name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${FUNCTION_ID.toLowerCase()}`,
        }),
      );
      expectedServiceInput.annotations[runv2.MIN_INSTANCES_ANNOTATION] = "1";
      expectedServiceInput.annotations[runv2.MAX_INSTANCES_ANNOTATION] = "10";

      expect(runv2.serviceFromEndpoint(endpoint, IMAGE_URI)).to.deep.equal(expectedServiceInput);
    });

    it("should set concurrency", () => {
      const endpoint: backend.Endpoint = {
        ...BASE_ENDPOINT_RUN,
        httpsTrigger: {},
        concurrency: 50,
      };
      const expectedServiceInput = JSON.parse(
        JSON.stringify({
          ...RUN_SERVICE_V2_INPUT_BASE,
          name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${FUNCTION_ID.toLowerCase()}`,
        }),
      );
      expectedServiceInput.template.containerConcurrency = 50;

      expect(runv2.serviceFromEndpoint(endpoint, IMAGE_URI)).to.deep.equal(expectedServiceInput);
    });

    it("should set memory and CPU", () => {
      const endpoint: backend.Endpoint = {
        ...BASE_ENDPOINT_RUN,
        httpsTrigger: {},
        availableMemoryMb: 512,
        cpu: 2,
      };
      const expectedServiceInput = JSON.parse(
        JSON.stringify({
          ...RUN_SERVICE_V2_INPUT_BASE,
          name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${FUNCTION_ID.toLowerCase()}`,
        }),
      );
      expectedServiceInput.template.containers[0].resources.limits.memory = "512Mi";
      expectedServiceInput.template.containers[0].resources.limits.cpu = "2";

      expect(runv2.serviceFromEndpoint(endpoint, IMAGE_URI)).to.deep.equal(expectedServiceInput);
    });

    it("should remove deployment-tool label", () => {
      const endpoint: backend.Endpoint = {
        ...BASE_ENDPOINT_RUN,
        httpsTrigger: {},
        labels: { "deployment-tool": "firebase-cli" },
      };
      const result = runv2.serviceFromEndpoint(endpoint, IMAGE_URI);
      expect(result.labels?.["deployment-tool"]).to.be.undefined;
      expect(result.labels?.[runv2.CLIENT_NAME_LABEL]).to.equal("firebase-functions");
    });
  });

  describe("endpointFromService", () => {
    it("should copy a minimal service", () => {
      const service: runv2.Service = {
        ...RUN_SERVICE_V2_OUTPUT_BASE,
        name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${SERVICE_ID}`,
        labels: {
          [runv2.RUNTIME_LABEL]: latest("nodejs"),
        },
        annotations: {
          [runv2.FUNCTION_ID_ANNOTATION]: FUNCTION_ID, // Using FUNCTION_ID_ANNOTATION as primary source for id
          [runv2.FUNCTION_TARGET_ANNOTATION]: "customEntryPoint",
        },
        template: {
          containers: [
            {
              name: runv2.DEFAULT_FUNCTION_CONTAINER_NAME,
              image: IMAGE_URI,
              resources: {
                limits: {
                  cpu: "1",
                  memory: "256Mi",
                },
              },
            },
          ],
        },
      };

      const expectedEndpoint: backend.Endpoint = {
        platform: "run",
        id: FUNCTION_ID,
        project: PROJECT_ID,
        region: LOCATION,
        runtime: latest("nodejs"),
        entryPoint: "customEntryPoint",
        availableMemoryMb: 256,
        cpu: 1,
        httpsTrigger: {},
        labels: {
          [runv2.RUNTIME_LABEL]: latest("nodejs"),
        },
        environmentVariables: {},
        secretEnvironmentVariables: [],
      };

      expect(runv2.endpointFromService(service)).to.deep.equal(expectedEndpoint);
    });

    it("should detect a service that's GCF managed", () => {
      const service: runv2.Service = {
        ...RUN_SERVICE_V2_OUTPUT_BASE,
        name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${SERVICE_ID}`,
        labels: {
          [runv2.RUNTIME_LABEL]: latest("nodejs"),
          [runv2.CLIENT_NAME_LABEL]: "cloud-functions", // This indicates it's GCF managed
        },
        annotations: {
          [runv2.FUNCTION_ID_ANNOTATION]: FUNCTION_ID, // Using FUNCTION_ID_ANNOTATION as primary source for id
          [runv2.FUNCTION_TARGET_ANNOTATION]: "customEntryPoint",
        },
        template: {
          containers: [
            {
              name: runv2.DEFAULT_FUNCTION_CONTAINER_NAME,
              image: IMAGE_URI,
              resources: {
                limits: {
                  cpu: "1",
                  memory: "256Mi",
                },
              },
            },
          ],
        },
      };

      const expectedEndpoint: backend.Endpoint = {
        platform: "gcfv2",
        id: FUNCTION_ID,
        project: PROJECT_ID,
        region: LOCATION,
        runtime: latest("nodejs"),
        entryPoint: "customEntryPoint",
        availableMemoryMb: 256,
        cpu: 1,
        httpsTrigger: {},
        labels: {
          [runv2.RUNTIME_LABEL]: latest("nodejs"),
          [runv2.CLIENT_NAME_LABEL]: "cloud-functions",
        },
        environmentVariables: {},
        secretEnvironmentVariables: [],
      };

      expect(runv2.endpointFromService(service)).to.deep.equal(expectedEndpoint);
    });

    it("should derive id from FUNCTION_TARGET_ANNOTATION if FUNCTION_ID_ANNOTATION is missing", () => {
      const service: runv2.Service = {
        ...RUN_SERVICE_V2_OUTPUT_BASE,
        name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${SERVICE_ID}`,
        labels: {
          [runv2.RUNTIME_LABEL]: latest("nodejs"),
        },
        annotations: {
          [runv2.FUNCTION_TARGET_ANNOTATION]: FUNCTION_ID, // This will be used for id and entryPoint
        },
        template: {
          containers: [
            {
              name: runv2.DEFAULT_FUNCTION_CONTAINER_NAME,
              image: IMAGE_URI,
              resources: { limits: { cpu: "1", memory: "256Mi" } },
            },
          ],
        },
      };
      const result = runv2.endpointFromService(service);
      expect(result.id).to.equal(FUNCTION_ID);
      expect(result.entryPoint).to.equal(FUNCTION_ID);
    });

    it("should derive id from service name part if FUNCTION_ID_ANNOTATION and FUNCTION_TARGET_ANNOTATION are missing", () => {
      const service: runv2.Service = {
        ...RUN_SERVICE_V2_OUTPUT_BASE,
        name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${SERVICE_ID}`,
        labels: {
          [runv2.RUNTIME_LABEL]: latest("nodejs"),
        },
        annotations: {
          // No FUNCTION_ID_ANNOTATION or FUNCTION_TARGET_ANNOTATION
        },
        template: {
          containers: [
            {
              name: runv2.DEFAULT_FUNCTION_CONTAINER_NAME,
              image: IMAGE_URI,
              resources: { limits: { cpu: "1", memory: "256Mi" } },
            },
          ],
        },
      };
      const result = runv2.endpointFromService(service);
      expect(result.id).to.equal(SERVICE_ID);
      expect(result.entryPoint).to.equal(SERVICE_ID);
    });

    it("should copy env vars and secrets", () => {
      const service: runv2.Service = JSON.parse(JSON.stringify(RUN_SERVICE_V2_OUTPUT_BASE));
      service.template.containers![0].env = [
        { name: "FOO", value: "bar" },
        {
          name: "MY_SECRET",
          valueSource: {
            secretKeyRef: {
              secret: `projects/${PROJECT_ID}/secrets/secret-name`,
              version: "1",
            },
          },
        },
      ];

      const result = runv2.endpointFromService(service);
      expect(result.environmentVariables).to.deep.equal({ FOO: "bar" });
      expect(result.secretEnvironmentVariables).to.deep.equal([
        { key: "MY_SECRET", secret: "secret-name", projectId: PROJECT_ID, version: "1" },
      ]);
    });

    it("should copy concurrency, min/max instances", () => {
      const service: runv2.Service = JSON.parse(JSON.stringify(RUN_SERVICE_V2_OUTPUT_BASE));
      service.template.containerConcurrency = 10;
      service.annotations![runv2.MIN_INSTANCES_ANNOTATION] = "2";
      service.annotations![runv2.MAX_INSTANCES_ANNOTATION] = "5";

      const result = runv2.endpointFromService(service);
      expect(result.concurrency).to.equal(10);
      expect(result.minInstances).to.equal(2);
      expect(result.maxInstances).to.equal(5);
    });

    it("should handle missing optional fields gracefully", () => {
      const service: runv2.Service = {
        name: `projects/${PROJECT_ID}/locations/${LOCATION}/services/${SERVICE_ID}`,
        generation: 1,
        template: {
          containers: [
            {
              name: runv2.DEFAULT_FUNCTION_CONTAINER_NAME,
              image: IMAGE_URI,
              resources: { limits: { memory: "128Mi", cpu: "0.5" } }, // Minimal resources
            },
          ],
          // No containerConcurrency, no serviceAccount
        },
        // No labels, no annotations
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
        creator: "test@example.com",
        lastModifier: "test@example.com",
        etag: "test-etag",
      };

      const expectedEndpoint: backend.Endpoint = {
        platform: "run",
        id: SERVICE_ID, // Derived from service name
        project: PROJECT_ID,
        region: LOCATION,
        runtime: latest("nodejs"), // Default runtime
        entryPoint: SERVICE_ID, // No FUNCTION_TARGET_ANNOTATION
        availableMemoryMb: 128,
        cpu: 0.5,
        httpsTrigger: {},
        labels: {},
        environmentVariables: {},
        secretEnvironmentVariables: [],
        // concurrency, minInstances, maxInstances will be undefined
      };

      expect(runv2.endpointFromService(service)).to.deep.equal(expectedEndpoint);
    });
  });
});