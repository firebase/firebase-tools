
Cloud Firestore automatically creates indexes for the most commen types of queries, but allows you to define custom indexes, as described in the [Firebase documentation](https://firebase.devsite.corp.google.com/docs/firestore/query-data/index-overview). You can set up custom indexes in the Firebase console, or in a JSON-formatted configuration file rolled out to production using the CLI's <code>firebase deploy</code> command.

Lorem ipsum. Lorem ipsum. Lorem ipsum. Lorem ipsum. Lorem ipsum. Lorem ipsum.

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

## Deploying an index configuration


## JSON format

### Indexes

<table>
  <tr>
    <th>Key</th>
    <th>Required</th>
    <th>Data type</th>
    <th>Value</th>
  </tr>
  <tr>
    <td>collectionGroup</td>
    <td>x</td>
    <td>string</td>
    <td></td>
  </tr>
  <tr>
    <td>queryScope</td>
    <td>x</td>
    <td>string</td>
    <td>One of:
    </td>
  </tr>
</table>

### FieldOverrides
