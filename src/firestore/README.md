
Now let's just do plain Markdown that works here and in Firesite.

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
</table>

### FieldOverrides
