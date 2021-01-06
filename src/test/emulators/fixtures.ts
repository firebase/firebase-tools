import { findModuleRoot, FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";

export const TIMEOUT_LONG = 10000;
export const TIMEOUT_MED = 5000;

export const MODULE_ROOT = findModuleRoot("firebase-tools", __dirname);
export const FunctionRuntimeBundles: { [key: string]: FunctionsRuntimeBundle } = {
  onCreate: {
    adminSdkConfig: {
      databaseURL: "https://fake-project-id-default-rtdb.firebaseio.com",
      storageBucket: "fake-project-id.appspot.com",
    },
    emulators: {
      firestore: {
        host: "localhost",
        port: 8080,
      },
    },
    cwd: MODULE_ROOT,
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
  },
  onWrite: {
    adminSdkConfig: {
      databaseURL: "https://fake-project-id-default-rtdb.firebaseio.com",
      storageBucket: "fake-project-id.appspot.com",
    },
    emulators: {
      firestore: {
        host: "localhost",
        port: 8080,
      },
    },
    cwd: MODULE_ROOT,
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
  },
  onDelete: {
    adminSdkConfig: {
      databaseURL: "https://fake-project-id-default-rtdb.firebaseio.com",
      storageBucket: "fake-project-id.appspot.com",
    },
    emulators: {
      firestore: {
        host: "localhost",
        port: 8080,
      },
    },
    cwd: MODULE_ROOT,
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
  },
  onUpdate: {
    adminSdkConfig: {
      databaseURL: "https://fake-project-id-default-rtdb.firebaseio.com",
      storageBucket: "fake-project-id.appspot.com",
    },
    emulators: {
      firestore: {
        host: "localhost",
        port: 8080,
      },
    },
    cwd: MODULE_ROOT,
    proto: {
      data: {
        oldValue: {
          name: "projects/fake-project/databases/(default)/documents/test/test",
          fields: {
            new: {
              stringValue: "old-value",
            },
          },
          createTime: "2019-05-14T23:04:30.459119Z",
          updateTime: "2019-05-15T16:21:15.148831Z",
        },
        updateMask: {
          fieldPaths: ["new"],
        },
        value: {
          name: "projects/fake-project/databases/(default)/documents/test/test",
          fields: {
            new: {
              stringValue: "new-value",
            },
          },
          createTime: "2019-05-14T23:04:30.459119Z",
          updateTime: "2019-05-15T16:21:15.148831Z",
        },
      },
      context: {
        eventId: "c0fdb141-bc01-49e7-98c8-9bc7f861de47-0",
        eventType: "providers/cloud.firestore/eventTypes/document.write",
        resource: {
          name: "projects/fake-project/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
        timestamp: "2019-05-15T16:21:15.148831Z",
      },
    },
    triggerId: "function_id",
    projectId: "fake-project-id",
  },
  onRequest: {
    adminSdkConfig: {
      databaseURL: "https://fake-project-id-default-rtdb.firebaseio.com",
      storageBucket: "fake-project-id.appspot.com",
    },
    emulators: {
      firestore: {
        host: "localhost",
        port: 8080,
      },
    },
    cwd: MODULE_ROOT,
    triggerId: "function_id",
    projectId: "fake-project-id",
  },
};
