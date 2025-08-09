# Schema Docs

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** dataconnect.yaml is how you configure a Firebase Data Connect service.

| Property                           | Pattern | Type            | Deprecated | Definition              | Title/Description                                                                           |
| ---------------------------------- | ------- | --------------- | ---------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| - [specVersion](#specVersion )     | No      | string          | No         | -                       | The Firebase Data Connect API version to target. If omitted, defaults to the latest version |
| - [serviceId](#serviceId )         | No      | string          | No         | -                       | The ID of the Firebase Data Connect service.                                                |
| - [location](#location )           | No      | string          | No         | -                       | The region of the Firebase Data Connect service.                                            |
| - [connectorDirs](#connectorDirs ) | No      | array of string | No         | -                       | A list of directories containing conector.yaml files describing a connector to deploy.      |
| - [schema](#schema )               | No      | object          | No         | In #/definitions/schema | -                                                                                           |

## <a name="specVersion"></a>1. Property `root > specVersion`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The Firebase Data Connect API version to target. If omitted, defaults to the latest version

## <a name="serviceId"></a>2. Property `root > serviceId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The ID of the Firebase Data Connect service.

## <a name="location"></a>3. Property `root > location`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The region of the Firebase Data Connect service.

## <a name="connectorDirs"></a>4. Property `root > connectorDirs`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** A list of directories containing conector.yaml files describing a connector to deploy.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be             | Description |
| ------------------------------------------- | ----------- |
| [connectorDirs items](#connectorDirs_items) | -           |

### <a name="connectorDirs_items"></a>4.1. root > connectorDirs > connectorDirs items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

## <a name="schema"></a>5. Property `root > schema`

|                           |                      |
| ------------------------- | -------------------- |
| **Type**                  | `object`             |
| **Required**              | No                   |
| **Additional properties** | Not allowed          |
| **Defined in**            | #/definitions/schema |

| Property                            | Pattern | Type   | Deprecated | Definition                  | Title/Description                                                                                      |
| ----------------------------------- | ------- | ------ | ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| - [source](#schema_source )         | No      | string | No         | -                           | Relative path to directory containing GQL files defining the schema. If omitted, defaults to ./schema. |
| - [datasource](#schema_datasource ) | No      | object | No         | In #/definitions/dataSource | -                                                                                                      |

### <a name="schema_source"></a>5.1. Property `root > schema > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Relative path to directory containing GQL files defining the schema. If omitted, defaults to ./schema.

### <a name="schema_datasource"></a>5.2. Property `root > schema > datasource`

|                           |                          |
| ------------------------- | ------------------------ |
| **Type**                  | `object`                 |
| **Required**              | No                       |
| **Additional properties** | Not allowed              |
| **Defined in**            | #/definitions/dataSource |

| Property                                       | Pattern | Type   | Deprecated | Definition                  | Title/Description |
| ---------------------------------------------- | ------- | ------ | ---------- | --------------------------- | ----------------- |
| - [postgresql](#schema_datasource_postgresql ) | No      | object | No         | In #/definitions/postgresql | -                 |

#### <a name="schema_datasource_postgresql"></a>5.2.1. Property `root > schema > datasource > postgresql`

|                           |                          |
| ------------------------- | ------------------------ |
| **Type**                  | `object`                 |
| **Required**              | No                       |
| **Additional properties** | Not allowed              |
| **Defined in**            | #/definitions/postgresql |

| Property                                              | Pattern | Type   | Deprecated | Definition | Title/Description                    |
| ----------------------------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------ |
| - [database](#schema_datasource_postgresql_database ) | No      | string | No         | -          | The name of the PostgreSQL database. |
| - [cloudSql](#schema_datasource_postgresql_cloudSql ) | No      | object | No         | -          | -                                    |

##### <a name="schema_datasource_postgresql_database"></a>5.2.1.1. Property `root > schema > datasource > postgresql > database`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The name of the PostgreSQL database.

##### <a name="schema_datasource_postgresql_cloudSql"></a>5.2.1.2. Property `root > schema > datasource > postgresql > cloudSql`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                       | Pattern | Type             | Deprecated | Definition | Title/Description                                 |
| ------------------------------------------------------------------------------ | ------- | ---------------- | ---------- | ---------- | ------------------------------------------------- |
| - [instanceId](#schema_datasource_postgresql_cloudSql_instanceId )             | No      | string           | No         | -          | The ID of the CloudSQL instance for this database |
| - [schemaValidation](#schema_datasource_postgresql_cloudSql_schemaValidation ) | No      | enum (of string) | No         | -          | Schema validation mode for schema migrations      |

###### <a name="schema_datasource_postgresql_cloudSql_instanceId"></a>5.2.1.2.1. Property `root > schema > datasource > postgresql > cloudSql > instanceId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The ID of the CloudSQL instance for this database

###### <a name="schema_datasource_postgresql_cloudSql_schemaValidation"></a>5.2.1.2.2. Property `root > schema > datasource > postgresql > cloudSql > schemaValidation`

|              |                    |
| ------------ | ------------------ |
| **Type**     | `enum (of string)` |
| **Required** | No                 |

**Description:** Schema validation mode for schema migrations

Must be one of:
* "COMPATIBLE"
* "STRICT"

----------------------------------------------------------------------------------------------------------------------------
Generated using [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans) on 2025-06-17 at 07:38:46 -0700
