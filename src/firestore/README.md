
Cloud Firestore automatically creates indexes for the most common types of queries, but allows you to define custom indexes as described in the [Cloud Firestore guides](https://firebase.devsite.corp.google.com/docs/firestore/query-data/index-overview). You can set up custom indexes in the Firebase console, or in a JSON-formatted configuration file rolled out to production using the CLI's <code>firebase deploy</code> command.

An index configuration file defines one object containing an <code>indexes</code> array and an optional <code>fieldOverrides</code> array. Here's an example:

```javascript
{
  // Required, specify compound indexes
  indexes: [
    { 
      collectionGroup: "posts",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "author", order: "ASCENDING" },
        { fieldPath: "timestamp", order: "DESCENDING" }
      ]
    }
  ],

  // Optional, disable indexes or enable single-field collection group indexes
  fieldOverrides: [
    {
      collectionGroup: "posts",
      fieldPath: "myBigMapField",
      fields: []
    }
  ]
}
```

## Deploy an index configuration


## JSON format

### Indexes

The schema for one object in the `indexes` array is as follows. Optional properties are identified with the `?` character.

```javascript
  collectionGroup: string     // test
  queryScope: string          // this 
  fields: array               // comment
    fieldPath: string
    order?: string
    arrayConfig?: string
```
### FieldOverrides

The schema for one object in the `fieldOverrides` array is as follows. Optional properties are identified with the `?` character.

```javascript
  collectionGroup: string     // test
  fieldPath: string           // this 
  fields: array               // comment
    fieldPath: string
    order?: string
    arrayConfig?: string
```
