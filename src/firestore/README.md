
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
    <td>Key</td>
    <td>Required</td>
    <td>Value</td>
  </tr>
</table>

### FieldOverrides
