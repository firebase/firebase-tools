Cloud Firestore automatically creates indexes to support the most common types of queries, but allows you to define custom indexes and index overrides as described in the [Cloud Firestore guides](https://firebase.google.com/docs/firestore/query-data/index-overview).

You can create, modify and deploy custom indexes in the Firebase console, or using the CLI. From the CLI, edit your index configuration file, with default filename`firestore.indexes.json`, and deploy using the <code>firebase deploy</code> command.

An index configuration file defines one object containing an <code>indexes</code> array and an optional <code>fieldOverrides</code> array. Here's an example:

```javascript
{
  // Required, specify compound indexes
  indexes: [
    {
      collectionGroup: "posts",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "author", arrayConfig: "CONTAINS" },
        { fieldPath: "timestamp", order: "DESCENDING" }
      ]
    }
  ],

  // Optional, disable indexes or enable single-field collection group indexes
  fieldOverrides: [
    {
      collectionGroup: "posts",
      fieldPath: "myBigMapField",
      // We want to disable indexing on our big map field, and so empty the indexes array
      indexes: []
    }
  ]
}
```

## Deploy an index configuration

Deploy your index configuration with the `firebase deploy` command. By default, `firebase deploy` pushes all code and assets related to a Firebase project. If you only want to deploy indexes, add the `--only firestore:indexes` flag.

If you make edits to the indexes using the Firebase console, make sure you also update your local indexes file.

For more on managing indexes, see the [Cloud Firestore guides](https://firebase.google.com/docs/firestore/query-data/indexing).

## JSON format

### Indexes

The schema for one object in the `indexes` array is as follows. Optional properties are identified with the `?` character.

Note that Cloud Firestore document fields can only be indexed in one [mode](https://firebase.google.com/docs/firestore/query-data/index-overview#index_modes), thus a field object cannot contain both the `order` and `arrayConfig` properties.

```javascript
  collectionGroup: string  // Labeled "Collection ID" in the Firebase console
  queryScope: string       // One of "COLLECTION", "COLLECTION_GROUP"
  fields: array
    fieldPath: string
    order?: string         // One of "ASCENDING", "DESCENDING"; excludes arrayConfig property
    arrayConfig?: string   // If this parameter used, must be "CONTAINS"; excludes order property
```

### FieldOverrides

The schema for one object in the `fieldOverrides` array is as follows. Optional properties are identified with the `?` character.

Note that Cloud Firestore document fields can only be indexed in one [mode](https://firebase.google.com/docs/firestore/query-data/index-overview#index_modes), thus a field object cannot contain both the `order` and `arrayConfig` properties.

```javascript
  collectionGroup: string  // Labeled "Collection ID" in the Firebase console
  fieldPath: string
  indexes: array           // Set empty array to disable indexes on this collectionGroup + fieldPath
    queryScope: string     // One of "COLLECTION", "COLLECTION_GROUP"
    order?: string         // One of "ASCENDING", "DESCENDING"; excludes arrayConfig property
    arrayConfig?: string   // If this parameter used, must be "CONTAINS"; excludes order property
```
