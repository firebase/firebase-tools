import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import { findModuleRoot, FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";

export const TIMEOUT_LONG = 10000;
export const TIMEOUT_MED = 5000;

export function createTmpDir(dirName: string) {
  return fs.mkdtempSync(path.join(tmpdir(), dirName));
}

export const MODULE_ROOT = findModuleRoot("firebase-tools", __dirname);
export const FunctionRuntimeBundles: { [key: string]: FunctionsRuntimeBundle } = {
  onCreate: {
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
  },
  onWrite: {
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
  },
  onDelete: {
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
  },
  onUpdate: {
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
  },
  onRequest: {
    proto: {},
  },
};

export const IMAGE_FILE_BASE64 =
  "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";

export const StorageRulesFiles = {
  usesMathematicalFunctions: {
    name: "/dev/null/storage.rules",
    content: `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if math.abs(-10) == 10;
    }
  }
}
`,
  },
  readWriteIfTrue: {
    name: "/dev/null/storage.rules",
    content: `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
`,
  },
  readWriteIfAnonymous: {
    name: "/dev/null/storage.rules",
    content: `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /testing {
      allow read: if true
    }
    match /testing/{allPaths=**} {
      allow write: if request.auth.token.firebase.sign_in_provider == 'anonymous';
    }
  }
}
`,
  },
  readWriteIfAuth: {
    name: "/dev/null/storage.rules",
    content: `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth!=null;
    }
  }
}
`,
  },
  readWriteIfAuthWithSyntaxError: {
    name: "/dev/null/storage.rules",
    content: `
rules_version = '2';
service firebase.storage {{
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth!=null;
    }
  }
}
`,
  },
  checkRequestIs42: {
    name: "/dev/null/storage.rules",
    content: `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /num_check/{filename} {
      allow read, write: if request == 42;
    }
  }
}
`,
  },
  checkRequestIs51: {
    name: "/dev/null/storage.rules",
    content: `
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /num_check/{filename} {
      allow read, write: if request == 51;
    }
  }
}
`,
  },
};

/*
service firebase.storage {
  match /b/{bucket}/o {
    match /authIsNotNull {
      allow read, write: if request.auth != null;
    }

    match /authUidMatchesPath/{uid} {
      allow read: if request.auth.uid == uid
    }

    match /imageSourceSizeUnder5MbAndContentTypeIsImage {
      // Only allow uploads of any image file that's less than 5MB
      allow write: if request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }

    match /customMetadataAndcustomTokenField {
      allow read: if resource.metadata.owner == request.auth.token.groupId;
      allow write: if request.auth.token.groupId == groupId;
    }

    function signedInOrHasVisibility(visibility) {
      return request.auth.uid != null || resource.metadata.visibility == visibility;
    }
    match /signInWithFuntion/{visiblityParams} {
      allow read, write: if signedInOrHasVisibility(visiblityParams);
    }

  }
}
 */
