# End-to-end Tests for Emulator Function Triggers

This test exercises support for Realtime Database function triggers as
introduced in the following PRs:

- https://github.com/firebase/firebase-tools/pull/1347
- https://github.com/firebase/firebase-tools/pull/1411

# Running Instructions

Install dependencies:

```
cd firebase-tools/scripts/triggers-end-to-end-tests && npm install
```

Run the test:

```
$ cd firebase-tools/scripts/triggers-end-to-end-tests && npm test
```

This end-to-end test uses the mocha testing framework.

## Verification

The test spins up a functions, database, and firestore emulator to verify the
following:

1. The functions emulator (firebase-tools >= v7.0.0) can register
   [triggers](https://firebase.google.com/docs/functions/database-events)
   with database emulators (>= v4.0.0).
2. The database emulator (>= v4.0.0) can invoke functions served by a local
   functions emulator instance.
3. Functions served by the functions emulator may be defined to operate on a
   local database emulator instance using the
   [node.js admin SDK](https://github.com/firebase/firebase-admin-node) (and are
   configured to do so by default).
4. Local functions triggered by a database emulator event may operate on a local
   firestore emulator instance using the node.js admin SDK.
5. Local functions triggered by a firestore emulator event may operate on both local
   database emulators (>= v4.0.0) and the invoking firestore emulator using the
   node.js admin SDK.

At a high level, this test verifies the use of cloud functions as a
bidirectional communication channel between the database emulator and Firestore.

## Implementation

To verify (2), the test installs the following http function:

```javascript
exports.writeToRtdb = functions.https.onRequest(async (req, res) => {
  const ref = admin.database().ref(START_DOCUMENT_NAME);
  await ref.set({ start: new Date().toISOString() });
  ref.once("value", (snap) => {
    res.json({ data: snap });
  });
});
```

This function performs a document write that triggers the following realtime
database function:

```javascript
exports.rtdbReaction = functions.database.ref(START_DOCUMENT_NAME).onWrite(async (change, ctx) => {
  console.log(RTDB_FUNCTION_LOG);

  const ref = admin.database().ref(END_DOCUMENT_NAME + "_from_database");
  await ref.set({ done: new Date().toISOString() });

  const firestoreref = admin.firestore().doc(END_DOCUMENT_NAME + "_from_database");
  await firestoreref.set({ done: new Date().toISOString() });

  return true;
});
```

The driver program for the end-to-end test has spawned the functions emulator as
a subprocess and searches for the presence of `RTDB_FUNCTION_LOG` in the process
to confirm (2).

In addition to printing a marker, the above database function also uses the
admin SDK to write "completion markers" back to the realtime database and
firestore emulators and a local firestore emulator. The test uses the presence of
these markers is checked by the driver program to confirm (3) and (4).

(5) is confirmed using analogous http and firestore-triggered functions. For
brevity, they are not reproduced here.
