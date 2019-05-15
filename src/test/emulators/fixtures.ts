import { findModuleRoot, FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";

export const TIMEOUT_LONG = 10000;
export const TIMEOUT_MED = 5000;

const cwd = findModuleRoot("firebase-tools", __dirname);
export const FunctionRuntimeBundles = {
  template: {
    ports: {},
    cwd,
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
  onCreate: {
    ports: {
      firestore: 8080,
    },
    cwd,
    proto: {
      data: {
        value: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          fields: {
            when: {
              timestampValue: "2019-04-15T16:55:48.150Z",
            },
          },
          createTime: "2019-04-15T16:56:13.737Z",
          updateTime: "2019-04-15T16:56:13.737Z",
        },
        updateMask: {},
      },
      context: {
        eventId: "7ebfb089-f549-4e1f-8312-fe843efc8be7",
        timestamp: "2019-04-15T16:56:13.737Z",
        eventType: "providers/cloud.firestore/eventTypes/document.create",
        resource: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
      },
    },
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
  onWrite: {
    ports: {
      firestore: 8080,
    },
    cwd,
    proto: {
      data: {
        value: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          fields: {
            when: {
              timestampValue: "2019-04-15T16:55:48.150Z",
            },
          },
          createTime: "2019-04-15T16:56:13.737Z",
          updateTime: "2019-04-15T16:56:13.737Z",
        },
        updateMask: {},
      },
      context: {
        eventId: "7ebfb089-f549-4e1f-8312-fe843efc8be7",
        timestamp: "2019-04-15T16:56:13.737Z",
        eventType: "providers/cloud.firestore/eventTypes/document.write",
        resource: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
      },
    },
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
  onDelete: {
    ports: {
      firestore: 8080,
    },
    cwd,
    proto: {
      data: {
        oldValue: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          fields: {
            when: {
              timestampValue: "2019-04-15T16:55:48.150Z",
            },
          },
          createTime: "2019-04-15T16:56:13.737Z",
          updateTime: "2019-04-15T16:56:13.737Z",
        },
        updateMask: {},
      },
      context: {
        eventId: "7ebfb089-f549-4e1f-8312-fe843efc8be7",
        timestamp: "2019-04-15T16:56:13.737Z",
        eventType: "providers/cloud.firestore/eventTypes/document.delete",
        resource: {
          name: "projects/fake-project-id/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
      },
    },
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
  onRequest: {
    ports: {
      firestore: 8080,
    },
    cwd,
    triggerId: "function_id",
    projectId: "fake-project-id",
  } as FunctionsRuntimeBundle,
};
