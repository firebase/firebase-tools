# firestore:delete

Delete data from Cloud Firestore.

## Usage
```
firebase firestore:delete [options] [path]
```

## Options
```
-r, --recursive    Recursive. Delete all documents and subcollections. Any action which would result in the deletion of child documents will fail if this argument is not passed. May not be passed along with --shallow.
--shallow          Shallow. Delete only parent documents and ignore documents in subcollections. Any action which would orphan documents will fail if this argument is not passed. May not be passed along with -r.
--all-collections  Delete all. Deletes the entire Firestore database, including all collections and documents. Any other flags or arguments will be ignored.
-y, --yes          No confirmation. Otherwise, a confirmation prompt will appear.
-h, --help         output usage information
```
