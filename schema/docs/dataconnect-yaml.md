

# 



<table>
<tbody>
<tr><th>$id</th><td>dataconnect.yaml</td></tr>
<tr><th>$schema</th><td>http://json-schema.org/draft-07/schema#</td></tr>
</tbody>
</table>

## Properties

<table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td colspan="2"><a href="#specversion">specVersion</a></td><td>String</td></tr><tr><td colspan="2"><a href="#serviceid">serviceId</a></td><td>String</td></tr><tr><td colspan="2"><a href="#location">location</a></td><td>String</td></tr><tr><td colspan="2"><a href="#connectordirs">connectorDirs</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#schema">schema</a></td><td>Object</td></tr></tbody></table>



<hr />


## specVersion


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Firebase Data Connect API version to target. If omitted, defaults to the latest version</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## serviceId


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The ID of the Firebase Data Connect service.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## location


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The region of the Firebase Data Connect service.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## connectorDirs


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A list of directories containing conector.yaml files describing a connector to deploy.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## schema


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>

### Properties
  <table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td colspan="2"><a href="#schemasource">source</a></td><td>String</td></tr><tr><td rowspan="1">datasource</td><td rowspan="1">One of:</td><td>Object</td></tr></tbody></table>


### schema.source


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Relative path to directory containing GQL files defining the schema. If omitted, defaults to ./schema.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### schema.datasource


<table class="jssd-property-table">
  <tbody>
    <tr><tr><td rowspan="1">Type</td><td rowspan="1">One of:</td><td>Object</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### schema.datasource.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### schema.datasource.0.postgresql


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### schema.datasource.0.postgresql.database


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The name of the PostgreSQL database.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### schema.datasource.0.postgresql.cloudSql


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### schema.datasource.0.postgresql.cloudSql.instanceId


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The ID of the CloudSQL instance for this database</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### schema.datasource.0.postgresql.cloudSql.schemaValidation


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Schema validation mode for schema migrations</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Enum</th>
      <td colspan="2"><ul><li>COMPATIBLE</li><li>STRICT</li></ul></td>
    </tr>
  </tbody>
</table>














<hr />

## Schema
```
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "dataconnect.yaml",
    "additionalProperties": false,
    "definitions": {
        "postgresql": {
            "additionalProperties": false,
            "type": "object",
            "properties": {
                "database": {
                    "type": "string",
                    "description": "The name of the PostgreSQL database."
                },
                "cloudSql": {
                    "additionalProperties": false,
                    "type": "object",
                    "properties": {
                        "instanceId": {
                            "type": "string",
                            "description": "The ID of the CloudSQL instance for this database"
                        },
                        "schemaValidation": {
                            "type": "string",
                            "enum": [
                                "COMPATIBLE",
                                "STRICT"
                            ],
                            "description": "Schema validation mode for schema migrations"
                        }
                    }
                }
            }
        },
        "dataSource": {
            "oneOf": [
                {
                    "additionalProperties": false,
                    "type": "object",
                    "properties": {
                        "postgresql": {
                            "$ref": "#/definitions/postgresql"
                        }
                    }
                }
            ]
        },
        "schema": {
            "additionalProperties": false,
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "description": "Relative path to directory containing GQL files defining the schema. If omitted, defaults to ./schema."
                },
                "datasource": {
                    "$ref": "#/definitions/dataSource"
                }
            }
        }
    },
    "properties": {
        "specVersion": {
            "type": "string",
            "description": "The Firebase Data Connect API version to target. If omitted, defaults to the latest version"
        },
        "serviceId": {
            "type": "string",
            "description": "The ID of the Firebase Data Connect service."
        },
        "location": {
            "type": "string",
            "description": "The region of the Firebase Data Connect service."
        },
        "connectorDirs": {
            "type": "array",
            "items": {
                "type": "string"
            },
            "description": "A list of directories containing conector.yaml files describing a connector to deploy."
        },
        "schema": {
            "$ref": "#/definitions/schema"
        }
    }
}
```


