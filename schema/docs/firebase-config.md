# Schema Docs

- [1. Property `root > $schema`](#schema)
- [2. Property `root > apphosting`](#apphosting)
  - [2.1. Property `root > apphosting > anyOf > item 0`](#apphosting_anyOf_i0)
    - [2.1.1. Property `root > apphosting > anyOf > item 0 > alwaysDeployFromSource`](#apphosting_anyOf_i0_alwaysDeployFromSource)
    - [2.1.2. Property `root > apphosting > anyOf > item 0 > backendId`](#apphosting_anyOf_i0_backendId)
    - [2.1.3. Property `root > apphosting > anyOf > item 0 > ignore`](#apphosting_anyOf_i0_ignore)
      - [2.1.3.1. root > apphosting > anyOf > item 0 > ignore > ignore items](#apphosting_anyOf_i0_ignore_items)
    - [2.1.4. Property `root > apphosting > anyOf > item 0 > rootDir`](#apphosting_anyOf_i0_rootDir)
  - [2.2. Property `root > apphosting > anyOf > item 1`](#apphosting_anyOf_i1)
    - [2.2.1. root > apphosting > anyOf > item 1 > item 1 items](#apphosting_anyOf_i1_items)
      - [2.2.1.1. Property `root > apphosting > anyOf > item 1 > item 1 items > alwaysDeployFromSource`](#apphosting_anyOf_i1_items_alwaysDeployFromSource)
      - [2.2.1.2. Property `root > apphosting > anyOf > item 1 > item 1 items > backendId`](#apphosting_anyOf_i1_items_backendId)
      - [2.2.1.3. Property `root > apphosting > anyOf > item 1 > item 1 items > ignore`](#apphosting_anyOf_i1_items_ignore)
        - [2.2.1.3.1. root > apphosting > anyOf > item 1 > item 1 items > ignore > ignore items](#apphosting_anyOf_i1_items_ignore_items)
      - [2.2.1.4. Property `root > apphosting > anyOf > item 1 > item 1 items > rootDir`](#apphosting_anyOf_i1_items_rootDir)
- [3. Property `root > database`](#database)
  - [3.1. Property `root > database > anyOf > DatabaseSingle`](#database_anyOf_i0)
    - [3.1.1. Property `root > database > anyOf > item 0 > postdeploy`](#database_anyOf_i0_postdeploy)
      - [3.1.1.1. Property `root > database > anyOf > item 0 > postdeploy > anyOf > item 0`](#database_anyOf_i0_postdeploy_anyOf_i0)
        - [3.1.1.1.1. root > database > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#database_anyOf_i0_postdeploy_anyOf_i0_items)
      - [3.1.1.2. Property `root > database > anyOf > item 0 > postdeploy > anyOf > item 1`](#database_anyOf_i0_postdeploy_anyOf_i1)
    - [3.1.2. Property `root > database > anyOf > item 0 > predeploy`](#database_anyOf_i0_predeploy)
      - [3.1.2.1. Property `root > database > anyOf > item 0 > predeploy > anyOf > item 0`](#database_anyOf_i0_predeploy_anyOf_i0)
        - [3.1.2.1.1. root > database > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#database_anyOf_i0_predeploy_anyOf_i0_items)
      - [3.1.2.2. Property `root > database > anyOf > item 0 > predeploy > anyOf > item 1`](#database_anyOf_i0_predeploy_anyOf_i1)
    - [3.1.3. Property `root > database > anyOf > item 0 > rules`](#database_anyOf_i0_rules)
  - [3.2. Property `root > database > anyOf > item 1`](#database_anyOf_i1)
    - [3.2.1. root > database > anyOf > item 1 > item 1 items](#database_anyOf_i1_items)
      - [3.2.1.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0`](#database_anyOf_i1_items_anyOf_i0)
        - [3.2.1.1.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > instance`](#database_anyOf_i1_items_anyOf_i0_instance)
        - [3.2.1.1.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy`](#database_anyOf_i1_items_anyOf_i0_postdeploy)
          - [3.2.1.1.2.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0`](#database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0)
            - [3.2.1.1.2.1.1. root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items)
          - [3.2.1.1.2.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 1`](#database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1)
        - [3.2.1.1.3. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy`](#database_anyOf_i1_items_anyOf_i0_predeploy)
          - [3.2.1.1.3.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0`](#database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0)
            - [3.2.1.1.3.1.1. root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items)
          - [3.2.1.1.3.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 1`](#database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1)
        - [3.2.1.1.4. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > rules`](#database_anyOf_i1_items_anyOf_i0_rules)
        - [3.2.1.1.5. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > target`](#database_anyOf_i1_items_anyOf_i0_target)
      - [3.2.1.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1`](#database_anyOf_i1_items_anyOf_i1)
        - [3.2.1.2.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > instance`](#database_anyOf_i1_items_anyOf_i1_instance)
        - [3.2.1.2.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy`](#database_anyOf_i1_items_anyOf_i1_postdeploy)
          - [3.2.1.2.2.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0`](#database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0)
            - [3.2.1.2.2.1.1. root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0 > item 0 items](#database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items)
          - [3.2.1.2.2.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 1`](#database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1)
        - [3.2.1.2.3. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy`](#database_anyOf_i1_items_anyOf_i1_predeploy)
          - [3.2.1.2.3.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0`](#database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0)
            - [3.2.1.2.3.1.1. root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0 > item 0 items](#database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items)
          - [3.2.1.2.3.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 1`](#database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1)
        - [3.2.1.2.4. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > rules`](#database_anyOf_i1_items_anyOf_i1_rules)
        - [3.2.1.2.5. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > target`](#database_anyOf_i1_items_anyOf_i1_target)
- [4. Property `root > dataconnect`](#dataconnect)
  - [4.1. Property `root > dataconnect > anyOf > DataConnectSingle`](#dataconnect_anyOf_i0)
    - [4.1.1. Property `root > dataconnect > anyOf > item 0 > postdeploy`](#dataconnect_anyOf_i0_postdeploy)
      - [4.1.1.1. Property `root > dataconnect > anyOf > item 0 > postdeploy > anyOf > item 0`](#dataconnect_anyOf_i0_postdeploy_anyOf_i0)
        - [4.1.1.1.1. root > dataconnect > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#dataconnect_anyOf_i0_postdeploy_anyOf_i0_items)
      - [4.1.1.2. Property `root > dataconnect > anyOf > item 0 > postdeploy > anyOf > item 1`](#dataconnect_anyOf_i0_postdeploy_anyOf_i1)
    - [4.1.2. Property `root > dataconnect > anyOf > item 0 > predeploy`](#dataconnect_anyOf_i0_predeploy)
      - [4.1.2.1. Property `root > dataconnect > anyOf > item 0 > predeploy > anyOf > item 0`](#dataconnect_anyOf_i0_predeploy_anyOf_i0)
        - [4.1.2.1.1. root > dataconnect > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#dataconnect_anyOf_i0_predeploy_anyOf_i0_items)
      - [4.1.2.2. Property `root > dataconnect > anyOf > item 0 > predeploy > anyOf > item 1`](#dataconnect_anyOf_i0_predeploy_anyOf_i1)
    - [4.1.3. Property `root > dataconnect > anyOf > item 0 > source`](#dataconnect_anyOf_i0_source)
  - [4.2. Property `root > dataconnect > anyOf > item 1`](#dataconnect_anyOf_i1)
    - [4.2.1. root > dataconnect > anyOf > item 1 > DataConnectSingle](#dataconnect_anyOf_i1_items)
- [5. Property `root > emulators`](#emulators)
  - [5.1. Property `root > emulators > apphosting`](#emulators_apphosting)
    - [5.1.1. Property `root > emulators > apphosting > host`](#emulators_apphosting_host)
    - [5.1.2. Property `root > emulators > apphosting > port`](#emulators_apphosting_port)
    - [5.1.3. Property `root > emulators > apphosting > rootDirectory`](#emulators_apphosting_rootDirectory)
    - [5.1.4. Property `root > emulators > apphosting > startCommand`](#emulators_apphosting_startCommand)
    - [5.1.5. Property `root > emulators > apphosting > startCommandOverride`](#emulators_apphosting_startCommandOverride)
  - [5.2. Property `root > emulators > auth`](#emulators_auth)
    - [5.2.1. Property `root > emulators > auth > host`](#emulators_auth_host)
    - [5.2.2. Property `root > emulators > auth > port`](#emulators_auth_port)
  - [5.3. Property `root > emulators > database`](#emulators_database)
    - [5.3.1. Property `root > emulators > database > host`](#emulators_database_host)
    - [5.3.2. Property `root > emulators > database > port`](#emulators_database_port)
  - [5.4. Property `root > emulators > dataconnect`](#emulators_dataconnect)
    - [5.4.1. Property `root > emulators > dataconnect > dataDir`](#emulators_dataconnect_dataDir)
    - [5.4.2. Property `root > emulators > dataconnect > host`](#emulators_dataconnect_host)
    - [5.4.3. Property `root > emulators > dataconnect > port`](#emulators_dataconnect_port)
    - [5.4.4. Property `root > emulators > dataconnect > postgresHost`](#emulators_dataconnect_postgresHost)
    - [5.4.5. Property `root > emulators > dataconnect > postgresPort`](#emulators_dataconnect_postgresPort)
  - [5.5. Property `root > emulators > eventarc`](#emulators_eventarc)
    - [5.5.1. Property `root > emulators > eventarc > host`](#emulators_eventarc_host)
    - [5.5.2. Property `root > emulators > eventarc > port`](#emulators_eventarc_port)
  - [5.6. Property `root > emulators > extensions`](#emulators_extensions)
  - [5.7. Property `root > emulators > firestore`](#emulators_firestore)
    - [5.7.1. Property `root > emulators > firestore > host`](#emulators_firestore_host)
    - [5.7.2. Property `root > emulators > firestore > port`](#emulators_firestore_port)
    - [5.7.3. Property `root > emulators > firestore > websocketPort`](#emulators_firestore_websocketPort)
  - [5.8. Property `root > emulators > hosting`](#emulators_hosting)
    - [5.8.1. Property `root > emulators > hosting > host`](#emulators_hosting_host)
    - [5.8.2. Property `root > emulators > hosting > port`](#emulators_hosting_port)
  - [5.9. Property `root > emulators > hub`](#emulators_hub)
    - [5.9.1. Property `root > emulators > hub > host`](#emulators_hub_host)
    - [5.9.2. Property `root > emulators > hub > port`](#emulators_hub_port)
  - [5.10. Property `root > emulators > logging`](#emulators_logging)
    - [5.10.1. Property `root > emulators > logging > host`](#emulators_logging_host)
    - [5.10.2. Property `root > emulators > logging > port`](#emulators_logging_port)
  - [5.11. Property `root > emulators > pubsub`](#emulators_pubsub)
    - [5.11.1. Property `root > emulators > pubsub > host`](#emulators_pubsub_host)
    - [5.11.2. Property `root > emulators > pubsub > port`](#emulators_pubsub_port)
  - [5.12. Property `root > emulators > singleProjectMode`](#emulators_singleProjectMode)
  - [5.13. Property `root > emulators > storage`](#emulators_storage)
    - [5.13.1. Property `root > emulators > storage > host`](#emulators_storage_host)
    - [5.13.2. Property `root > emulators > storage > port`](#emulators_storage_port)
  - [5.14. Property `root > emulators > tasks`](#emulators_tasks)
    - [5.14.1. Property `root > emulators > tasks > host`](#emulators_tasks_host)
    - [5.14.2. Property `root > emulators > tasks > port`](#emulators_tasks_port)
  - [5.15. Property `root > emulators > ui`](#emulators_ui)
    - [5.15.1. Property `root > emulators > ui > enabled`](#emulators_ui_enabled)
    - [5.15.2. Property `root > emulators > ui > host`](#emulators_ui_host)
    - [5.15.3. Property `root > emulators > ui > port`](#emulators_ui_port)
- [6. Property `root > extensions`](#extensions)
- [7. Property `root > firestore`](#firestore)
  - [7.1. Property `root > firestore > anyOf > FirestoreSingle`](#firestore_anyOf_i0)
    - [7.1.1. Property `root > firestore > anyOf > item 0 > database`](#firestore_anyOf_i0_database)
    - [7.1.2. Property `root > firestore > anyOf > item 0 > indexes`](#firestore_anyOf_i0_indexes)
    - [7.1.3. Property `root > firestore > anyOf > item 0 > location`](#firestore_anyOf_i0_location)
    - [7.1.4. Property `root > firestore > anyOf > item 0 > postdeploy`](#firestore_anyOf_i0_postdeploy)
      - [7.1.4.1. Property `root > firestore > anyOf > item 0 > postdeploy > anyOf > item 0`](#firestore_anyOf_i0_postdeploy_anyOf_i0)
        - [7.1.4.1.1. root > firestore > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#firestore_anyOf_i0_postdeploy_anyOf_i0_items)
      - [7.1.4.2. Property `root > firestore > anyOf > item 0 > postdeploy > anyOf > item 1`](#firestore_anyOf_i0_postdeploy_anyOf_i1)
    - [7.1.5. Property `root > firestore > anyOf > item 0 > predeploy`](#firestore_anyOf_i0_predeploy)
      - [7.1.5.1. Property `root > firestore > anyOf > item 0 > predeploy > anyOf > item 0`](#firestore_anyOf_i0_predeploy_anyOf_i0)
        - [7.1.5.1.1. root > firestore > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#firestore_anyOf_i0_predeploy_anyOf_i0_items)
      - [7.1.5.2. Property `root > firestore > anyOf > item 0 > predeploy > anyOf > item 1`](#firestore_anyOf_i0_predeploy_anyOf_i1)
    - [7.1.6. Property `root > firestore > anyOf > item 0 > rules`](#firestore_anyOf_i0_rules)
  - [7.2. Property `root > firestore > anyOf > item 1`](#firestore_anyOf_i1)
    - [7.2.1. root > firestore > anyOf > item 1 > item 1 items](#firestore_anyOf_i1_items)
      - [7.2.1.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0`](#firestore_anyOf_i1_items_anyOf_i0)
        - [7.2.1.1.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > database`](#firestore_anyOf_i1_items_anyOf_i0_database)
        - [7.2.1.1.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > indexes`](#firestore_anyOf_i1_items_anyOf_i0_indexes)
        - [7.2.1.1.3. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy`](#firestore_anyOf_i1_items_anyOf_i0_postdeploy)
          - [7.2.1.1.3.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0`](#firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0)
            - [7.2.1.1.3.1.1. root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items)
          - [7.2.1.1.3.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 1`](#firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1)
        - [7.2.1.1.4. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy`](#firestore_anyOf_i1_items_anyOf_i0_predeploy)
          - [7.2.1.1.4.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0`](#firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0)
            - [7.2.1.1.4.1.1. root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items)
          - [7.2.1.1.4.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 1`](#firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1)
        - [7.2.1.1.5. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > rules`](#firestore_anyOf_i1_items_anyOf_i0_rules)
        - [7.2.1.1.6. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > target`](#firestore_anyOf_i1_items_anyOf_i0_target)
      - [7.2.1.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1`](#firestore_anyOf_i1_items_anyOf_i1)
        - [7.2.1.2.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > database`](#firestore_anyOf_i1_items_anyOf_i1_database)
        - [7.2.1.2.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > indexes`](#firestore_anyOf_i1_items_anyOf_i1_indexes)
        - [7.2.1.2.3. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy`](#firestore_anyOf_i1_items_anyOf_i1_postdeploy)
          - [7.2.1.2.3.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0`](#firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0)
            - [7.2.1.2.3.1.1. root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0 > item 0 items](#firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items)
          - [7.2.1.2.3.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 1`](#firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1)
        - [7.2.1.2.4. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy`](#firestore_anyOf_i1_items_anyOf_i1_predeploy)
          - [7.2.1.2.4.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0`](#firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0)
            - [7.2.1.2.4.1.1. root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0 > item 0 items](#firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items)
          - [7.2.1.2.4.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 1`](#firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1)
        - [7.2.1.2.5. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > rules`](#firestore_anyOf_i1_items_anyOf_i1_rules)
        - [7.2.1.2.6. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > target`](#firestore_anyOf_i1_items_anyOf_i1_target)
- [8. Property `root > functions`](#functions)
  - [8.1. Property `root > functions > anyOf > FunctionConfig`](#functions_anyOf_i0)
    - [8.1.1. Property `root > functions > anyOf > item 0 > codebase`](#functions_anyOf_i0_codebase)
    - [8.1.2. Property `root > functions > anyOf > item 0 > ignore`](#functions_anyOf_i0_ignore)
      - [8.1.2.1. root > functions > anyOf > item 0 > ignore > ignore items](#functions_anyOf_i0_ignore_items)
    - [8.1.3. Property `root > functions > anyOf > item 0 > postdeploy`](#functions_anyOf_i0_postdeploy)
      - [8.1.3.1. Property `root > functions > anyOf > item 0 > postdeploy > anyOf > item 0`](#functions_anyOf_i0_postdeploy_anyOf_i0)
        - [8.1.3.1.1. root > functions > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#functions_anyOf_i0_postdeploy_anyOf_i0_items)
      - [8.1.3.2. Property `root > functions > anyOf > item 0 > postdeploy > anyOf > item 1`](#functions_anyOf_i0_postdeploy_anyOf_i1)
    - [8.1.4. Property `root > functions > anyOf > item 0 > predeploy`](#functions_anyOf_i0_predeploy)
      - [8.1.4.1. Property `root > functions > anyOf > item 0 > predeploy > anyOf > item 0`](#functions_anyOf_i0_predeploy_anyOf_i0)
        - [8.1.4.1.1. root > functions > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#functions_anyOf_i0_predeploy_anyOf_i0_items)
      - [8.1.4.2. Property `root > functions > anyOf > item 0 > predeploy > anyOf > item 1`](#functions_anyOf_i0_predeploy_anyOf_i1)
    - [8.1.5. Property `root > functions > anyOf > item 0 > runtime`](#functions_anyOf_i0_runtime)
    - [8.1.6. Property `root > functions > anyOf > item 0 > source`](#functions_anyOf_i0_source)
  - [8.2. Property `root > functions > anyOf > item 1`](#functions_anyOf_i1)
    - [8.2.1. root > functions > anyOf > item 1 > FunctionConfig](#functions_anyOf_i1_items)
- [9. Property `root > hosting`](#hosting)
  - [9.1. Property `root > hosting > anyOf > HostingSingle`](#hosting_anyOf_i0)
    - [9.1.1. Property `root > hosting > anyOf > item 0 > appAssociation`](#hosting_anyOf_i0_appAssociation)
    - [9.1.2. Property `root > hosting > anyOf > item 0 > cleanUrls`](#hosting_anyOf_i0_cleanUrls)
    - [9.1.3. Property `root > hosting > anyOf > item 0 > frameworksBackend`](#hosting_anyOf_i0_frameworksBackend)
      - [9.1.3.1. Property `root > hosting > anyOf > item 0 > frameworksBackend > concurrency`](#hosting_anyOf_i0_frameworksBackend_concurrency)
      - [9.1.3.2. Property `root > hosting > anyOf > item 0 > frameworksBackend > cors`](#hosting_anyOf_i0_frameworksBackend_cors)
      - [9.1.3.3. Property `root > hosting > anyOf > item 0 > frameworksBackend > cpu`](#hosting_anyOf_i0_frameworksBackend_cpu)
        - [9.1.3.3.1. Property `root > hosting > anyOf > item 0 > frameworksBackend > cpu > anyOf > item 0`](#hosting_anyOf_i0_frameworksBackend_cpu_anyOf_i0)
        - [9.1.3.3.2. Property `root > hosting > anyOf > item 0 > frameworksBackend > cpu > anyOf > item 1`](#hosting_anyOf_i0_frameworksBackend_cpu_anyOf_i1)
      - [9.1.3.4. Property `root > hosting > anyOf > item 0 > frameworksBackend > enforceAppCheck`](#hosting_anyOf_i0_frameworksBackend_enforceAppCheck)
      - [9.1.3.5. Property `root > hosting > anyOf > item 0 > frameworksBackend > ingressSettings`](#hosting_anyOf_i0_frameworksBackend_ingressSettings)
      - [9.1.3.6. Property `root > hosting > anyOf > item 0 > frameworksBackend > invoker`](#hosting_anyOf_i0_frameworksBackend_invoker)
      - [9.1.3.7. Property `root > hosting > anyOf > item 0 > frameworksBackend > labels`](#hosting_anyOf_i0_frameworksBackend_labels)
      - [9.1.3.8. Property `root > hosting > anyOf > item 0 > frameworksBackend > maxInstances`](#hosting_anyOf_i0_frameworksBackend_maxInstances)
      - [9.1.3.9. Property `root > hosting > anyOf > item 0 > frameworksBackend > memory`](#hosting_anyOf_i0_frameworksBackend_memory)
      - [9.1.3.10. Property `root > hosting > anyOf > item 0 > frameworksBackend > minInstances`](#hosting_anyOf_i0_frameworksBackend_minInstances)
      - [9.1.3.11. Property `root > hosting > anyOf > item 0 > frameworksBackend > omit`](#hosting_anyOf_i0_frameworksBackend_omit)
      - [9.1.3.12. Property `root > hosting > anyOf > item 0 > frameworksBackend > preserveExternalChanges`](#hosting_anyOf_i0_frameworksBackend_preserveExternalChanges)
      - [9.1.3.13. Property `root > hosting > anyOf > item 0 > frameworksBackend > region`](#hosting_anyOf_i0_frameworksBackend_region)
      - [9.1.3.14. Property `root > hosting > anyOf > item 0 > frameworksBackend > secrets`](#hosting_anyOf_i0_frameworksBackend_secrets)
        - [9.1.3.14.1. root > hosting > anyOf > item 0 > frameworksBackend > secrets > secrets items](#hosting_anyOf_i0_frameworksBackend_secrets_items)
      - [9.1.3.15. Property `root > hosting > anyOf > item 0 > frameworksBackend > serviceAccount`](#hosting_anyOf_i0_frameworksBackend_serviceAccount)
      - [9.1.3.16. Property `root > hosting > anyOf > item 0 > frameworksBackend > timeoutSeconds`](#hosting_anyOf_i0_frameworksBackend_timeoutSeconds)
      - [9.1.3.17. Property `root > hosting > anyOf > item 0 > frameworksBackend > vpcConnector`](#hosting_anyOf_i0_frameworksBackend_vpcConnector)
      - [9.1.3.18. Property `root > hosting > anyOf > item 0 > frameworksBackend > vpcConnectorEgressSettings`](#hosting_anyOf_i0_frameworksBackend_vpcConnectorEgressSettings)
    - [9.1.4. Property `root > hosting > anyOf > item 0 > headers`](#hosting_anyOf_i0_headers)
      - [9.1.4.1. root > hosting > anyOf > item 0 > headers > HostingHeaders](#hosting_anyOf_i0_headers_items)
        - [9.1.4.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0`](#hosting_anyOf_i0_headers_items_anyOf_i0)
          - [9.1.4.1.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > glob`](#hosting_anyOf_i0_headers_items_anyOf_i0_glob)
          - [9.1.4.1.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > headers`](#hosting_anyOf_i0_headers_items_anyOf_i0_headers)
            - [9.1.4.1.1.2.1. root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > headers > headers items](#hosting_anyOf_i0_headers_items_anyOf_i0_headers_items)
              - [9.1.4.1.1.2.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > headers > headers items > key`](#hosting_anyOf_i0_headers_items_anyOf_i0_headers_items_key)
              - [9.1.4.1.1.2.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > headers > headers items > value`](#hosting_anyOf_i0_headers_items_anyOf_i0_headers_items_value)
        - [9.1.4.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1`](#hosting_anyOf_i0_headers_items_anyOf_i1)
          - [9.1.4.1.2.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > headers`](#hosting_anyOf_i0_headers_items_anyOf_i1_headers)
            - [9.1.4.1.2.1.1. root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > headers > headers items](#hosting_anyOf_i0_headers_items_anyOf_i1_headers_items)
              - [9.1.4.1.2.1.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > headers > headers items > key`](#hosting_anyOf_i0_headers_items_anyOf_i1_headers_items_key)
              - [9.1.4.1.2.1.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > headers > headers items > value`](#hosting_anyOf_i0_headers_items_anyOf_i1_headers_items_value)
          - [9.1.4.1.2.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > source`](#hosting_anyOf_i0_headers_items_anyOf_i1_source)
        - [9.1.4.1.3. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2`](#hosting_anyOf_i0_headers_items_anyOf_i2)
          - [9.1.4.1.3.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > headers`](#hosting_anyOf_i0_headers_items_anyOf_i2_headers)
            - [9.1.4.1.3.1.1. root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > headers > headers items](#hosting_anyOf_i0_headers_items_anyOf_i2_headers_items)
              - [9.1.4.1.3.1.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > headers > headers items > key`](#hosting_anyOf_i0_headers_items_anyOf_i2_headers_items_key)
              - [9.1.4.1.3.1.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > headers > headers items > value`](#hosting_anyOf_i0_headers_items_anyOf_i2_headers_items_value)
          - [9.1.4.1.3.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > regex`](#hosting_anyOf_i0_headers_items_anyOf_i2_regex)
    - [9.1.5. Property `root > hosting > anyOf > item 0 > i18n`](#hosting_anyOf_i0_i18n)
      - [9.1.5.1. Property `root > hosting > anyOf > item 0 > i18n > root`](#hosting_anyOf_i0_i18n_root)
    - [9.1.6. Property `root > hosting > anyOf > item 0 > ignore`](#hosting_anyOf_i0_ignore)
      - [9.1.6.1. root > hosting > anyOf > item 0 > ignore > ignore items](#hosting_anyOf_i0_ignore_items)
    - [9.1.7. Property `root > hosting > anyOf > item 0 > postdeploy`](#hosting_anyOf_i0_postdeploy)
      - [9.1.7.1. Property `root > hosting > anyOf > item 0 > postdeploy > anyOf > item 0`](#hosting_anyOf_i0_postdeploy_anyOf_i0)
        - [9.1.7.1.1. root > hosting > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#hosting_anyOf_i0_postdeploy_anyOf_i0_items)
      - [9.1.7.2. Property `root > hosting > anyOf > item 0 > postdeploy > anyOf > item 1`](#hosting_anyOf_i0_postdeploy_anyOf_i1)
    - [9.1.8. Property `root > hosting > anyOf > item 0 > predeploy`](#hosting_anyOf_i0_predeploy)
      - [9.1.8.1. Property `root > hosting > anyOf > item 0 > predeploy > anyOf > item 0`](#hosting_anyOf_i0_predeploy_anyOf_i0)
        - [9.1.8.1.1. root > hosting > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#hosting_anyOf_i0_predeploy_anyOf_i0_items)
      - [9.1.8.2. Property `root > hosting > anyOf > item 0 > predeploy > anyOf > item 1`](#hosting_anyOf_i0_predeploy_anyOf_i1)
    - [9.1.9. Property `root > hosting > anyOf > item 0 > public`](#hosting_anyOf_i0_public)
    - [9.1.10. Property `root > hosting > anyOf > item 0 > redirects`](#hosting_anyOf_i0_redirects)
      - [9.1.10.1. root > hosting > anyOf > item 0 > redirects > HostingRedirects](#hosting_anyOf_i0_redirects_items)
        - [9.1.10.1.1. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 0`](#hosting_anyOf_i0_redirects_items_anyOf_i0)
          - [9.1.10.1.1.1. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 0 > destination`](#hosting_anyOf_i0_redirects_items_anyOf_i0_destination)
          - [9.1.10.1.1.2. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 0 > glob`](#hosting_anyOf_i0_redirects_items_anyOf_i0_glob)
          - [9.1.10.1.1.3. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 0 > type`](#hosting_anyOf_i0_redirects_items_anyOf_i0_type)
        - [9.1.10.1.2. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 1`](#hosting_anyOf_i0_redirects_items_anyOf_i1)
          - [9.1.10.1.2.1. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 1 > destination`](#hosting_anyOf_i0_redirects_items_anyOf_i1_destination)
          - [9.1.10.1.2.2. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 1 > source`](#hosting_anyOf_i0_redirects_items_anyOf_i1_source)
          - [9.1.10.1.2.3. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 1 > type`](#hosting_anyOf_i0_redirects_items_anyOf_i1_type)
        - [9.1.10.1.3. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 2`](#hosting_anyOf_i0_redirects_items_anyOf_i2)
          - [9.1.10.1.3.1. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 2 > destination`](#hosting_anyOf_i0_redirects_items_anyOf_i2_destination)
          - [9.1.10.1.3.2. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 2 > regex`](#hosting_anyOf_i0_redirects_items_anyOf_i2_regex)
          - [9.1.10.1.3.3. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 2 > type`](#hosting_anyOf_i0_redirects_items_anyOf_i2_type)
    - [9.1.11. Property `root > hosting > anyOf > item 0 > rewrites`](#hosting_anyOf_i0_rewrites)
      - [9.1.11.1. root > hosting > anyOf > item 0 > rewrites > HostingRewrites](#hosting_anyOf_i0_rewrites_items)
        - [9.1.11.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 0`](#hosting_anyOf_i0_rewrites_items_anyOf_i0)
          - [9.1.11.1.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 0 > destination`](#hosting_anyOf_i0_rewrites_items_anyOf_i0_destination)
          - [9.1.11.1.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 0 > glob`](#hosting_anyOf_i0_rewrites_items_anyOf_i0_glob)
        - [9.1.11.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 1`](#hosting_anyOf_i0_rewrites_items_anyOf_i1)
          - [9.1.11.1.2.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 1 > function`](#hosting_anyOf_i0_rewrites_items_anyOf_i1_function)
          - [9.1.11.1.2.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 1 > glob`](#hosting_anyOf_i0_rewrites_items_anyOf_i1_glob)
          - [9.1.11.1.2.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 1 > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i1_region)
        - [9.1.11.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2`](#hosting_anyOf_i0_rewrites_items_anyOf_i2)
          - [9.1.11.1.3.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > function`](#hosting_anyOf_i0_rewrites_items_anyOf_i2_function)
            - [9.1.11.1.3.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > function > functionId`](#hosting_anyOf_i0_rewrites_items_anyOf_i2_function_functionId)
            - [9.1.11.1.3.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > function > pinTag`](#hosting_anyOf_i0_rewrites_items_anyOf_i2_function_pinTag)
            - [9.1.11.1.3.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > function > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i2_function_region)
          - [9.1.11.1.3.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > glob`](#hosting_anyOf_i0_rewrites_items_anyOf_i2_glob)
        - [9.1.11.1.4. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3`](#hosting_anyOf_i0_rewrites_items_anyOf_i3)
          - [9.1.11.1.4.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > glob`](#hosting_anyOf_i0_rewrites_items_anyOf_i3_glob)
          - [9.1.11.1.4.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > run`](#hosting_anyOf_i0_rewrites_items_anyOf_i3_run)
            - [9.1.11.1.4.2.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > run > pinTag`](#hosting_anyOf_i0_rewrites_items_anyOf_i3_run_pinTag)
            - [9.1.11.1.4.2.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > run > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i3_run_region)
            - [9.1.11.1.4.2.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > run > serviceId`](#hosting_anyOf_i0_rewrites_items_anyOf_i3_run_serviceId)
        - [9.1.11.1.5. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 4`](#hosting_anyOf_i0_rewrites_items_anyOf_i4)
          - [9.1.11.1.5.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 4 > dynamicLinks`](#hosting_anyOf_i0_rewrites_items_anyOf_i4_dynamicLinks)
          - [9.1.11.1.5.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 4 > glob`](#hosting_anyOf_i0_rewrites_items_anyOf_i4_glob)
        - [9.1.11.1.6. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 5`](#hosting_anyOf_i0_rewrites_items_anyOf_i5)
          - [9.1.11.1.6.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 5 > destination`](#hosting_anyOf_i0_rewrites_items_anyOf_i5_destination)
          - [9.1.11.1.6.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 5 > source`](#hosting_anyOf_i0_rewrites_items_anyOf_i5_source)
        - [9.1.11.1.7. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 6`](#hosting_anyOf_i0_rewrites_items_anyOf_i6)
          - [9.1.11.1.7.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 6 > function`](#hosting_anyOf_i0_rewrites_items_anyOf_i6_function)
          - [9.1.11.1.7.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 6 > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i6_region)
          - [9.1.11.1.7.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 6 > source`](#hosting_anyOf_i0_rewrites_items_anyOf_i6_source)
        - [9.1.11.1.8. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7`](#hosting_anyOf_i0_rewrites_items_anyOf_i7)
          - [9.1.11.1.8.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > function`](#hosting_anyOf_i0_rewrites_items_anyOf_i7_function)
            - [9.1.11.1.8.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > function > functionId`](#hosting_anyOf_i0_rewrites_items_anyOf_i7_function_functionId)
            - [9.1.11.1.8.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > function > pinTag`](#hosting_anyOf_i0_rewrites_items_anyOf_i7_function_pinTag)
            - [9.1.11.1.8.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > function > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i7_function_region)
          - [9.1.11.1.8.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > source`](#hosting_anyOf_i0_rewrites_items_anyOf_i7_source)
        - [9.1.11.1.9. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8`](#hosting_anyOf_i0_rewrites_items_anyOf_i8)
          - [9.1.11.1.9.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > run`](#hosting_anyOf_i0_rewrites_items_anyOf_i8_run)
            - [9.1.11.1.9.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > run > pinTag`](#hosting_anyOf_i0_rewrites_items_anyOf_i8_run_pinTag)
            - [9.1.11.1.9.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > run > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i8_run_region)
            - [9.1.11.1.9.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > run > serviceId`](#hosting_anyOf_i0_rewrites_items_anyOf_i8_run_serviceId)
          - [9.1.11.1.9.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > source`](#hosting_anyOf_i0_rewrites_items_anyOf_i8_source)
        - [9.1.11.1.10. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 9`](#hosting_anyOf_i0_rewrites_items_anyOf_i9)
          - [9.1.11.1.10.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 9 > dynamicLinks`](#hosting_anyOf_i0_rewrites_items_anyOf_i9_dynamicLinks)
          - [9.1.11.1.10.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 9 > source`](#hosting_anyOf_i0_rewrites_items_anyOf_i9_source)
        - [9.1.11.1.11. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 10`](#hosting_anyOf_i0_rewrites_items_anyOf_i10)
          - [9.1.11.1.11.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 10 > destination`](#hosting_anyOf_i0_rewrites_items_anyOf_i10_destination)
          - [9.1.11.1.11.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 10 > regex`](#hosting_anyOf_i0_rewrites_items_anyOf_i10_regex)
        - [9.1.11.1.12. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 11`](#hosting_anyOf_i0_rewrites_items_anyOf_i11)
          - [9.1.11.1.12.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 11 > function`](#hosting_anyOf_i0_rewrites_items_anyOf_i11_function)
          - [9.1.11.1.12.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 11 > regex`](#hosting_anyOf_i0_rewrites_items_anyOf_i11_regex)
          - [9.1.11.1.12.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 11 > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i11_region)
        - [9.1.11.1.13. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12`](#hosting_anyOf_i0_rewrites_items_anyOf_i12)
          - [9.1.11.1.13.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > function`](#hosting_anyOf_i0_rewrites_items_anyOf_i12_function)
            - [9.1.11.1.13.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > function > functionId`](#hosting_anyOf_i0_rewrites_items_anyOf_i12_function_functionId)
            - [9.1.11.1.13.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > function > pinTag`](#hosting_anyOf_i0_rewrites_items_anyOf_i12_function_pinTag)
            - [9.1.11.1.13.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > function > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i12_function_region)
          - [9.1.11.1.13.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > regex`](#hosting_anyOf_i0_rewrites_items_anyOf_i12_regex)
        - [9.1.11.1.14. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13`](#hosting_anyOf_i0_rewrites_items_anyOf_i13)
          - [9.1.11.1.14.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > regex`](#hosting_anyOf_i0_rewrites_items_anyOf_i13_regex)
          - [9.1.11.1.14.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > run`](#hosting_anyOf_i0_rewrites_items_anyOf_i13_run)
            - [9.1.11.1.14.2.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > run > pinTag`](#hosting_anyOf_i0_rewrites_items_anyOf_i13_run_pinTag)
            - [9.1.11.1.14.2.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > run > region`](#hosting_anyOf_i0_rewrites_items_anyOf_i13_run_region)
            - [9.1.11.1.14.2.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > run > serviceId`](#hosting_anyOf_i0_rewrites_items_anyOf_i13_run_serviceId)
        - [9.1.11.1.15. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 14`](#hosting_anyOf_i0_rewrites_items_anyOf_i14)
          - [9.1.11.1.15.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 14 > dynamicLinks`](#hosting_anyOf_i0_rewrites_items_anyOf_i14_dynamicLinks)
          - [9.1.11.1.15.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 14 > regex`](#hosting_anyOf_i0_rewrites_items_anyOf_i14_regex)
    - [9.1.12. Property `root > hosting > anyOf > item 0 > site`](#hosting_anyOf_i0_site)
    - [9.1.13. Property `root > hosting > anyOf > item 0 > source`](#hosting_anyOf_i0_source)
    - [9.1.14. Property `root > hosting > anyOf > item 0 > target`](#hosting_anyOf_i0_target)
    - [9.1.15. Property `root > hosting > anyOf > item 0 > trailingSlash`](#hosting_anyOf_i0_trailingSlash)
  - [9.2. Property `root > hosting > anyOf > item 1`](#hosting_anyOf_i1)
    - [9.2.1. root > hosting > anyOf > item 1 > item 1 items](#hosting_anyOf_i1_items)
      - [9.2.1.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0`](#hosting_anyOf_i1_items_anyOf_i0)
        - [9.2.1.1.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > appAssociation`](#hosting_anyOf_i1_items_anyOf_i0_appAssociation)
        - [9.2.1.1.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > cleanUrls`](#hosting_anyOf_i1_items_anyOf_i0_cleanUrls)
        - [9.2.1.1.3. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > frameworksBackend`](#hosting_anyOf_i1_items_anyOf_i0_frameworksBackend)
        - [9.2.1.1.4. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > headers`](#hosting_anyOf_i1_items_anyOf_i0_headers)
          - [9.2.1.1.4.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > headers > HostingHeaders](#hosting_anyOf_i1_items_anyOf_i0_headers_items)
        - [9.2.1.1.5. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > i18n`](#hosting_anyOf_i1_items_anyOf_i0_i18n)
          - [9.2.1.1.5.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > i18n > root`](#hosting_anyOf_i1_items_anyOf_i0_i18n_root)
        - [9.2.1.1.6. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > ignore`](#hosting_anyOf_i1_items_anyOf_i0_ignore)
          - [9.2.1.1.6.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > ignore > ignore items](#hosting_anyOf_i1_items_anyOf_i0_ignore_items)
        - [9.2.1.1.7. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy`](#hosting_anyOf_i1_items_anyOf_i0_postdeploy)
          - [9.2.1.1.7.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0`](#hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0)
            - [9.2.1.1.7.1.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items)
          - [9.2.1.1.7.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 1`](#hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1)
        - [9.2.1.1.8. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy`](#hosting_anyOf_i1_items_anyOf_i0_predeploy)
          - [9.2.1.1.8.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0`](#hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0)
            - [9.2.1.1.8.1.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items)
          - [9.2.1.1.8.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 1`](#hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1)
        - [9.2.1.1.9. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > public`](#hosting_anyOf_i1_items_anyOf_i0_public)
        - [9.2.1.1.10. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > redirects`](#hosting_anyOf_i1_items_anyOf_i0_redirects)
          - [9.2.1.1.10.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > redirects > HostingRedirects](#hosting_anyOf_i1_items_anyOf_i0_redirects_items)
        - [9.2.1.1.11. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > rewrites`](#hosting_anyOf_i1_items_anyOf_i0_rewrites)
          - [9.2.1.1.11.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > rewrites > HostingRewrites](#hosting_anyOf_i1_items_anyOf_i0_rewrites_items)
        - [9.2.1.1.12. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > site`](#hosting_anyOf_i1_items_anyOf_i0_site)
        - [9.2.1.1.13. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > source`](#hosting_anyOf_i1_items_anyOf_i0_source)
        - [9.2.1.1.14. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > target`](#hosting_anyOf_i1_items_anyOf_i0_target)
        - [9.2.1.1.15. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > trailingSlash`](#hosting_anyOf_i1_items_anyOf_i0_trailingSlash)
      - [9.2.1.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1`](#hosting_anyOf_i1_items_anyOf_i1)
        - [9.2.1.2.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > appAssociation`](#hosting_anyOf_i1_items_anyOf_i1_appAssociation)
        - [9.2.1.2.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > cleanUrls`](#hosting_anyOf_i1_items_anyOf_i1_cleanUrls)
        - [9.2.1.2.3. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > frameworksBackend`](#hosting_anyOf_i1_items_anyOf_i1_frameworksBackend)
        - [9.2.1.2.4. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > headers`](#hosting_anyOf_i1_items_anyOf_i1_headers)
          - [9.2.1.2.4.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > headers > HostingHeaders](#hosting_anyOf_i1_items_anyOf_i1_headers_items)
        - [9.2.1.2.5. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > i18n`](#hosting_anyOf_i1_items_anyOf_i1_i18n)
          - [9.2.1.2.5.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > i18n > root`](#hosting_anyOf_i1_items_anyOf_i1_i18n_root)
        - [9.2.1.2.6. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > ignore`](#hosting_anyOf_i1_items_anyOf_i1_ignore)
          - [9.2.1.2.6.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > ignore > ignore items](#hosting_anyOf_i1_items_anyOf_i1_ignore_items)
        - [9.2.1.2.7. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy`](#hosting_anyOf_i1_items_anyOf_i1_postdeploy)
          - [9.2.1.2.7.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0`](#hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0)
            - [9.2.1.2.7.1.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0 > item 0 items](#hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items)
          - [9.2.1.2.7.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 1`](#hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1)
        - [9.2.1.2.8. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy`](#hosting_anyOf_i1_items_anyOf_i1_predeploy)
          - [9.2.1.2.8.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0`](#hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0)
            - [9.2.1.2.8.1.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0 > item 0 items](#hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items)
          - [9.2.1.2.8.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 1`](#hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1)
        - [9.2.1.2.9. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > public`](#hosting_anyOf_i1_items_anyOf_i1_public)
        - [9.2.1.2.10. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > redirects`](#hosting_anyOf_i1_items_anyOf_i1_redirects)
          - [9.2.1.2.10.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > redirects > HostingRedirects](#hosting_anyOf_i1_items_anyOf_i1_redirects_items)
        - [9.2.1.2.11. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > rewrites`](#hosting_anyOf_i1_items_anyOf_i1_rewrites)
          - [9.2.1.2.11.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > rewrites > HostingRewrites](#hosting_anyOf_i1_items_anyOf_i1_rewrites_items)
        - [9.2.1.2.12. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > site`](#hosting_anyOf_i1_items_anyOf_i1_site)
        - [9.2.1.2.13. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > source`](#hosting_anyOf_i1_items_anyOf_i1_source)
        - [9.2.1.2.14. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > target`](#hosting_anyOf_i1_items_anyOf_i1_target)
        - [9.2.1.2.15. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > trailingSlash`](#hosting_anyOf_i1_items_anyOf_i1_trailingSlash)
- [10. Property `root > remoteconfig`](#remoteconfig)
  - [10.1. Property `root > remoteconfig > postdeploy`](#remoteconfig_postdeploy)
    - [10.1.1. Property `root > remoteconfig > postdeploy > anyOf > item 0`](#remoteconfig_postdeploy_anyOf_i0)
      - [10.1.1.1. root > remoteconfig > postdeploy > anyOf > item 0 > item 0 items](#remoteconfig_postdeploy_anyOf_i0_items)
    - [10.1.2. Property `root > remoteconfig > postdeploy > anyOf > item 1`](#remoteconfig_postdeploy_anyOf_i1)
  - [10.2. Property `root > remoteconfig > predeploy`](#remoteconfig_predeploy)
    - [10.2.1. Property `root > remoteconfig > predeploy > anyOf > item 0`](#remoteconfig_predeploy_anyOf_i0)
      - [10.2.1.1. root > remoteconfig > predeploy > anyOf > item 0 > item 0 items](#remoteconfig_predeploy_anyOf_i0_items)
    - [10.2.2. Property `root > remoteconfig > predeploy > anyOf > item 1`](#remoteconfig_predeploy_anyOf_i1)
  - [10.3. Property `root > remoteconfig > template`](#remoteconfig_template)
- [11. Property `root > storage`](#storage)
  - [11.1. Property `root > storage > anyOf > StorageSingle`](#storage_anyOf_i0)
    - [11.1.1. Property `root > storage > anyOf > item 0 > postdeploy`](#storage_anyOf_i0_postdeploy)
      - [11.1.1.1. Property `root > storage > anyOf > item 0 > postdeploy > anyOf > item 0`](#storage_anyOf_i0_postdeploy_anyOf_i0)
        - [11.1.1.1.1. root > storage > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items](#storage_anyOf_i0_postdeploy_anyOf_i0_items)
      - [11.1.1.2. Property `root > storage > anyOf > item 0 > postdeploy > anyOf > item 1`](#storage_anyOf_i0_postdeploy_anyOf_i1)
    - [11.1.2. Property `root > storage > anyOf > item 0 > predeploy`](#storage_anyOf_i0_predeploy)
      - [11.1.2.1. Property `root > storage > anyOf > item 0 > predeploy > anyOf > item 0`](#storage_anyOf_i0_predeploy_anyOf_i0)
        - [11.1.2.1.1. root > storage > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items](#storage_anyOf_i0_predeploy_anyOf_i0_items)
      - [11.1.2.2. Property `root > storage > anyOf > item 0 > predeploy > anyOf > item 1`](#storage_anyOf_i0_predeploy_anyOf_i1)
    - [11.1.3. Property `root > storage > anyOf > item 0 > rules`](#storage_anyOf_i0_rules)
    - [11.1.4. Property `root > storage > anyOf > item 0 > target`](#storage_anyOf_i0_target)
  - [11.2. Property `root > storage > anyOf > item 1`](#storage_anyOf_i1)
    - [11.2.1. root > storage > anyOf > item 1 > item 1 items](#storage_anyOf_i1_items)
      - [11.2.1.1. Property `root > storage > anyOf > item 1 > item 1 items > bucket`](#storage_anyOf_i1_items_bucket)
      - [11.2.1.2. Property `root > storage > anyOf > item 1 > item 1 items > postdeploy`](#storage_anyOf_i1_items_postdeploy)
        - [11.2.1.2.1. Property `root > storage > anyOf > item 1 > item 1 items > postdeploy > anyOf > item 0`](#storage_anyOf_i1_items_postdeploy_anyOf_i0)
          - [11.2.1.2.1.1. root > storage > anyOf > item 1 > item 1 items > postdeploy > anyOf > item 0 > item 0 items](#storage_anyOf_i1_items_postdeploy_anyOf_i0_items)
        - [11.2.1.2.2. Property `root > storage > anyOf > item 1 > item 1 items > postdeploy > anyOf > item 1`](#storage_anyOf_i1_items_postdeploy_anyOf_i1)
      - [11.2.1.3. Property `root > storage > anyOf > item 1 > item 1 items > predeploy`](#storage_anyOf_i1_items_predeploy)
        - [11.2.1.3.1. Property `root > storage > anyOf > item 1 > item 1 items > predeploy > anyOf > item 0`](#storage_anyOf_i1_items_predeploy_anyOf_i0)
          - [11.2.1.3.1.1. root > storage > anyOf > item 1 > item 1 items > predeploy > anyOf > item 0 > item 0 items](#storage_anyOf_i1_items_predeploy_anyOf_i0_items)
        - [11.2.1.3.2. Property `root > storage > anyOf > item 1 > item 1 items > predeploy > anyOf > item 1`](#storage_anyOf_i1_items_predeploy_anyOf_i1)
      - [11.2.1.4. Property `root > storage > anyOf > item 1 > item 1 items > rules`](#storage_anyOf_i1_items_rules)
      - [11.2.1.5. Property `root > storage > anyOf > item 1 > item 1 items > target`](#storage_anyOf_i1_items_target)

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Information about the resources in your Firebase project.
This used for declarative deployments via `firebase deploy` and local emulation via `firebase emulators:start`

| Property                         | Pattern | Type        | Deprecated | Definition                          | Title/Description                                                             |
| -------------------------------- | ------- | ----------- | ---------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| - [$schema](#schema )            | No      | string      | No         | -                                   | Unused. Included in schema so that the schema can be applied to single files. |
| - [apphosting](#apphosting )     | No      | Combination | No         | -                                   | The App Hosting backend(s) that should be deployed or emulated.               |
| - [database](#database )         | No      | Combination | No         | -                                   | The Realtime Database rules that should be deployed or emulated.              |
| - [dataconnect](#dataconnect )   | No      | Combination | No         | -                                   | The Data Connect service(s) that should be deployed or emulated.              |
| - [emulators](#emulators )       | No      | object      | No         | -                                   | Hosts, ports, and configuration options for the Firebase Emulator suite.      |
| - [extensions](#extensions )     | No      | object      | No         | In #/definitions/ExtensionsConfig   | The Firebase Extension(s) that should be deployed or emulated.                |
| - [firestore](#firestore )       | No      | Combination | No         | -                                   | The Firestore rules and indexes that should be deployed or emulated.          |
| - [functions](#functions )       | No      | Combination | No         | -                                   | The Cloud Functions for Firebase that should be deployed or emulated.         |
| - [hosting](#hosting )           | No      | Combination | No         | -                                   | The Firebase Hosting site(s) that should be deployed or emulated.             |
| - [remoteconfig](#remoteconfig ) | No      | object      | No         | In #/definitions/RemoteConfigConfig | The Remote Config template(s) used by this project.                           |
| - [storage](#storage )           | No      | Combination | No         | -                                   | The Firebase Storage rules that should be deployed or emulated.               |

## <a name="schema"></a>1. Property `root > $schema`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |
| **Format**   | `uri`    |

**Description:** Unused. Included in schema so that the schema can be applied to single files.

## <a name="apphosting"></a>2. Property `root > apphosting`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** The App Hosting backend(s) that should be deployed or emulated.

| Any of(Option)                 |
| ------------------------------ |
| [item 0](#apphosting_anyOf_i0) |
| [item 1](#apphosting_anyOf_i1) |

### <a name="apphosting_anyOf_i0"></a>2.1. Property `root > apphosting > anyOf > item 0`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** A single App Hosting deployment configs

| Property                                                                 | Pattern | Type            | Deprecated | Definition | Title/Description                                                                       |
| ------------------------------------------------------------------------ | ------- | --------------- | ---------- | ---------- | --------------------------------------------------------------------------------------- |
| - [alwaysDeployFromSource](#apphosting_anyOf_i0_alwaysDeployFromSource ) | No      | boolean         | No         | -          | If true, this backend will only be deployed from local source, not from source control. |
| + [backendId](#apphosting_anyOf_i0_backendId )                           | No      | string          | No         | -          | -                                                                                       |
| + [ignore](#apphosting_anyOf_i0_ignore )                                 | No      | array of string | No         | -          | A list of file paths to exclude from the archive that is uploaded for this backend.     |
| + [rootDir](#apphosting_anyOf_i0_rootDir )                               | No      | string          | No         | -          | -                                                                                       |

#### <a name="apphosting_anyOf_i0_alwaysDeployFromSource"></a>2.1.1. Property `root > apphosting > anyOf > item 0 > alwaysDeployFromSource`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, this backend will only be deployed from local source, not from source control.

#### <a name="apphosting_anyOf_i0_backendId"></a>2.1.2. Property `root > apphosting > anyOf > item 0 > backendId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

#### <a name="apphosting_anyOf_i0_ignore"></a>2.1.3. Property `root > apphosting > anyOf > item 0 > ignore`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | Yes               |

**Description:** A list of file paths to exclude from the archive that is uploaded for this backend.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                   | Description |
| ------------------------------------------------- | ----------- |
| [ignore items](#apphosting_anyOf_i0_ignore_items) | -           |

##### <a name="apphosting_anyOf_i0_ignore_items"></a>2.1.3.1. root > apphosting > anyOf > item 0 > ignore > ignore items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="apphosting_anyOf_i0_rootDir"></a>2.1.4. Property `root > apphosting > anyOf > item 0 > rootDir`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

### <a name="apphosting_anyOf_i1"></a>2.2. Property `root > apphosting > anyOf > item 1`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of object` |
| **Required** | No                |

**Description:** A list of App Hosting deployment configs

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be            | Description                             |
| ------------------------------------------ | --------------------------------------- |
| [item 1 items](#apphosting_anyOf_i1_items) | A single App Hosting deployment configs |

#### <a name="apphosting_anyOf_i1_items"></a>2.2.1. root > apphosting > anyOf > item 1 > item 1 items

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** A single App Hosting deployment configs

| Property                                                                       | Pattern | Type            | Deprecated | Definition | Title/Description                                                                       |
| ------------------------------------------------------------------------------ | ------- | --------------- | ---------- | ---------- | --------------------------------------------------------------------------------------- |
| - [alwaysDeployFromSource](#apphosting_anyOf_i1_items_alwaysDeployFromSource ) | No      | boolean         | No         | -          | If true, this backend will only be deployed from local source, not from source control. |
| + [backendId](#apphosting_anyOf_i1_items_backendId )                           | No      | string          | No         | -          | -                                                                                       |
| + [ignore](#apphosting_anyOf_i1_items_ignore )                                 | No      | array of string | No         | -          | A list of file paths to exclude from the archive that is uploaded for this backend.     |
| + [rootDir](#apphosting_anyOf_i1_items_rootDir )                               | No      | string          | No         | -          | -                                                                                       |

##### <a name="apphosting_anyOf_i1_items_alwaysDeployFromSource"></a>2.2.1.1. Property `root > apphosting > anyOf > item 1 > item 1 items > alwaysDeployFromSource`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, this backend will only be deployed from local source, not from source control.

##### <a name="apphosting_anyOf_i1_items_backendId"></a>2.2.1.2. Property `root > apphosting > anyOf > item 1 > item 1 items > backendId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

##### <a name="apphosting_anyOf_i1_items_ignore"></a>2.2.1.3. Property `root > apphosting > anyOf > item 1 > item 1 items > ignore`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | Yes               |

**Description:** A list of file paths to exclude from the archive that is uploaded for this backend.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                         | Description |
| ------------------------------------------------------- | ----------- |
| [ignore items](#apphosting_anyOf_i1_items_ignore_items) | -           |

###### <a name="apphosting_anyOf_i1_items_ignore_items"></a>2.2.1.3.1. root > apphosting > anyOf > item 1 > item 1 items > ignore > ignore items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="apphosting_anyOf_i1_items_rootDir"></a>2.2.1.4. Property `root > apphosting > anyOf > item 1 > item 1 items > rootDir`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

## <a name="database"></a>3. Property `root > database`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** The Realtime Database rules that should be deployed or emulated.

| Any of(Option)                       |
| ------------------------------------ |
| [DatabaseSingle](#database_anyOf_i0) |
| [item 1](#database_anyOf_i1)         |

### <a name="database_anyOf_i0"></a>3.1. Property `root > database > anyOf > DatabaseSingle`

|                           |                              |
| ------------------------- | ---------------------------- |
| **Type**                  | `object`                     |
| **Required**              | No                           |
| **Additional properties** | Not allowed                  |
| **Defined in**            | #/definitions/DatabaseSingle |

**Description:** Deployment options for a single Realtime Database instance.

| Property                                       | Pattern | Type        | Deprecated | Definition | Title/Description                                                             |
| ---------------------------------------------- | ------- | ----------- | ---------- | ---------- | ----------------------------------------------------------------------------- |
| - [postdeploy](#database_anyOf_i0_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.  |
| - [predeploy](#database_anyOf_i0_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed. |
| + [rules](#database_anyOf_i0_rules )           | No      | string      | No         | -          | The rules files for this Realtime Database instance.                          |

#### <a name="database_anyOf_i0_postdeploy"></a>3.1.1. Property `root > database > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                   |
| ------------------------------------------------ |
| [item 0](#database_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#database_anyOf_i0_postdeploy_anyOf_i1) |

##### <a name="database_anyOf_i0_postdeploy_anyOf_i0"></a>3.1.1.1. Property `root > database > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                              | Description |
| ------------------------------------------------------------ | ----------- |
| [item 0 items](#database_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="database_anyOf_i0_postdeploy_anyOf_i0_items"></a>3.1.1.1.1. root > database > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="database_anyOf_i0_postdeploy_anyOf_i1"></a>3.1.1.2. Property `root > database > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="database_anyOf_i0_predeploy"></a>3.1.2. Property `root > database > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                  |
| ----------------------------------------------- |
| [item 0](#database_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#database_anyOf_i0_predeploy_anyOf_i1) |

##### <a name="database_anyOf_i0_predeploy_anyOf_i0"></a>3.1.2.1. Property `root > database > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                             | Description |
| ----------------------------------------------------------- | ----------- |
| [item 0 items](#database_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="database_anyOf_i0_predeploy_anyOf_i0_items"></a>3.1.2.1.1. root > database > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="database_anyOf_i0_predeploy_anyOf_i1"></a>3.1.2.2. Property `root > database > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="database_anyOf_i0_rules"></a>3.1.3. Property `root > database > anyOf > item 0 > rules`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The rules files for this Realtime Database instance.

### <a name="database_anyOf_i1"></a>3.2. Property `root > database > anyOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Deployment options for a list of Realtime Database instancs.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be          | Description |
| ---------------------------------------- | ----------- |
| [item 1 items](#database_anyOf_i1_items) | -           |

#### <a name="database_anyOf_i1_items"></a>3.2.1. root > database > anyOf > item 1 > item 1 items

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

| Any of(Option)                              |
| ------------------------------------------- |
| [item 0](#database_anyOf_i1_items_anyOf_i0) |
| [item 1](#database_anyOf_i1_items_anyOf_i1) |

##### <a name="database_anyOf_i1_items_anyOf_i0"></a>3.2.1.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                      | Pattern | Type        | Deprecated | Definition | Title/Description                                                             |
| ------------------------------------------------------------- | ------- | ----------- | ---------- | ---------- | ----------------------------------------------------------------------------- |
| + [instance](#database_anyOf_i1_items_anyOf_i0_instance )     | No      | string      | No         | -          | The instance that this rules files is for.                                    |
| - [postdeploy](#database_anyOf_i1_items_anyOf_i0_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.  |
| - [predeploy](#database_anyOf_i1_items_anyOf_i0_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed. |
| + [rules](#database_anyOf_i1_items_anyOf_i0_rules )           | No      | string      | No         | -          | The rules files for this Realtime Database instance.                          |
| - [target](#database_anyOf_i1_items_anyOf_i0_target )         | No      | string      | No         | -          | -                                                                             |

###### <a name="database_anyOf_i1_items_anyOf_i0_instance"></a>3.2.1.1.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > instance`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The instance that this rules files is for.

###### <a name="database_anyOf_i1_items_anyOf_i0_postdeploy"></a>3.2.1.1.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                                  |
| --------------------------------------------------------------- |
| [item 0](#database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1) |

###### <a name="database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0"></a>3.2.1.1.2.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                             | Description |
| --------------------------------------------------------------------------- | ----------- |
| [item 0 items](#database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items"></a>3.2.1.1.2.1.1. root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="database_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1"></a>3.2.1.1.2.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="database_anyOf_i1_items_anyOf_i0_predeploy"></a>3.2.1.1.3. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                                 |
| -------------------------------------------------------------- |
| [item 0](#database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1) |

###### <a name="database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0"></a>3.2.1.1.3.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                            | Description |
| -------------------------------------------------------------------------- | ----------- |
| [item 0 items](#database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items"></a>3.2.1.1.3.1.1. root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="database_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1"></a>3.2.1.1.3.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="database_anyOf_i1_items_anyOf_i0_rules"></a>3.2.1.1.4. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > rules`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The rules files for this Realtime Database instance.

###### <a name="database_anyOf_i1_items_anyOf_i0_target"></a>3.2.1.1.5. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 0 > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="database_anyOf_i1_items_anyOf_i1"></a>3.2.1.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                      | Pattern | Type        | Deprecated | Definition | Title/Description                                                             |
| ------------------------------------------------------------- | ------- | ----------- | ---------- | ---------- | ----------------------------------------------------------------------------- |
| - [instance](#database_anyOf_i1_items_anyOf_i1_instance )     | No      | string      | No         | -          | The instance that this rules files is for.                                    |
| - [postdeploy](#database_anyOf_i1_items_anyOf_i1_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.  |
| - [predeploy](#database_anyOf_i1_items_anyOf_i1_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed. |
| + [rules](#database_anyOf_i1_items_anyOf_i1_rules )           | No      | string      | No         | -          | The rules files for this Realtime Database instance.                          |
| + [target](#database_anyOf_i1_items_anyOf_i1_target )         | No      | string      | No         | -          | -                                                                             |

###### <a name="database_anyOf_i1_items_anyOf_i1_instance"></a>3.2.1.2.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > instance`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The instance that this rules files is for.

###### <a name="database_anyOf_i1_items_anyOf_i1_postdeploy"></a>3.2.1.2.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                                  |
| --------------------------------------------------------------- |
| [item 0](#database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0) |
| [item 1](#database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1) |

###### <a name="database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0"></a>3.2.1.2.2.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                             | Description |
| --------------------------------------------------------------------------- | ----------- |
| [item 0 items](#database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items) | -           |

###### <a name="database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items"></a>3.2.1.2.2.1.1. root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="database_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1"></a>3.2.1.2.2.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="database_anyOf_i1_items_anyOf_i1_predeploy"></a>3.2.1.2.3. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                                 |
| -------------------------------------------------------------- |
| [item 0](#database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0) |
| [item 1](#database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1) |

###### <a name="database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0"></a>3.2.1.2.3.1. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                            | Description |
| -------------------------------------------------------------------------- | ----------- |
| [item 0 items](#database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items) | -           |

###### <a name="database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items"></a>3.2.1.2.3.1.1. root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="database_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1"></a>3.2.1.2.3.2. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="database_anyOf_i1_items_anyOf_i1_rules"></a>3.2.1.2.4. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > rules`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The rules files for this Realtime Database instance.

###### <a name="database_anyOf_i1_items_anyOf_i1_target"></a>3.2.1.2.5. Property `root > database > anyOf > item 1 > item 1 items > anyOf > item 1 > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

## <a name="dataconnect"></a>4. Property `root > dataconnect`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** The Data Connect service(s) that should be deployed or emulated.

| Any of(Option)                             |
| ------------------------------------------ |
| [DataConnectSingle](#dataconnect_anyOf_i0) |
| [item 1](#dataconnect_anyOf_i1)            |

### <a name="dataconnect_anyOf_i0"></a>4.1. Property `root > dataconnect > anyOf > DataConnectSingle`

|                           |                                 |
| ------------------------- | ------------------------------- |
| **Type**                  | `object`                        |
| **Required**              | No                              |
| **Additional properties** | Not allowed                     |
| **Defined in**            | #/definitions/DataConnectSingle |

**Description:** A single Data Connect deployment configs

| Property                                          | Pattern | Type        | Deprecated | Definition | Title/Description                                                             |
| ------------------------------------------------- | ------- | ----------- | ---------- | ---------- | ----------------------------------------------------------------------------- |
| - [postdeploy](#dataconnect_anyOf_i0_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.  |
| - [predeploy](#dataconnect_anyOf_i0_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed. |
| + [source](#dataconnect_anyOf_i0_source )         | No      | string      | No         | -          | -                                                                             |

#### <a name="dataconnect_anyOf_i0_postdeploy"></a>4.1.1. Property `root > dataconnect > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                      |
| --------------------------------------------------- |
| [item 0](#dataconnect_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#dataconnect_anyOf_i0_postdeploy_anyOf_i1) |

##### <a name="dataconnect_anyOf_i0_postdeploy_anyOf_i0"></a>4.1.1.1. Property `root > dataconnect > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                 | Description |
| --------------------------------------------------------------- | ----------- |
| [item 0 items](#dataconnect_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="dataconnect_anyOf_i0_postdeploy_anyOf_i0_items"></a>4.1.1.1.1. root > dataconnect > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="dataconnect_anyOf_i0_postdeploy_anyOf_i1"></a>4.1.1.2. Property `root > dataconnect > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="dataconnect_anyOf_i0_predeploy"></a>4.1.2. Property `root > dataconnect > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                     |
| -------------------------------------------------- |
| [item 0](#dataconnect_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#dataconnect_anyOf_i0_predeploy_anyOf_i1) |

##### <a name="dataconnect_anyOf_i0_predeploy_anyOf_i0"></a>4.1.2.1. Property `root > dataconnect > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                | Description |
| -------------------------------------------------------------- | ----------- |
| [item 0 items](#dataconnect_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="dataconnect_anyOf_i0_predeploy_anyOf_i0_items"></a>4.1.2.1.1. root > dataconnect > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="dataconnect_anyOf_i0_predeploy_anyOf_i1"></a>4.1.2.2. Property `root > dataconnect > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="dataconnect_anyOf_i0_source"></a>4.1.3. Property `root > dataconnect > anyOf > item 0 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

### <a name="dataconnect_anyOf_i1"></a>4.2. Property `root > dataconnect > anyOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list of Data Connect deployment configs

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                  | Description                              |
| ------------------------------------------------ | ---------------------------------------- |
| [DataConnectSingle](#dataconnect_anyOf_i1_items) | A single Data Connect deployment configs |

#### <a name="dataconnect_anyOf_i1_items"></a>4.2.1. root > dataconnect > anyOf > item 1 > DataConnectSingle

|                           |                                               |
| ------------------------- | --------------------------------------------- |
| **Type**                  | `object`                                      |
| **Required**              | No                                            |
| **Additional properties** | Not allowed                                   |
| **Same definition as**    | [dataconnect_anyOf_i0](#dataconnect_anyOf_i0) |

**Description:** A single Data Connect deployment configs

## <a name="emulators"></a>5. Property `root > emulators`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Hosts, ports, and configuration options for the Firebase Emulator suite.

| Property                                             | Pattern | Type    | Deprecated | Definition | Title/Description                                                                  |
| ---------------------------------------------------- | ------- | ------- | ---------- | ---------- | ---------------------------------------------------------------------------------- |
| - [apphosting](#emulators_apphosting )               | No      | object  | No         | -          | Config for the App Hosting emulator                                                |
| - [auth](#emulators_auth )                           | No      | object  | No         | -          | Config for the Auth emulator                                                       |
| - [database](#emulators_database )                   | No      | object  | No         | -          | Config for the Realtime Database emulator                                          |
| - [dataconnect](#emulators_dataconnect )             | No      | object  | No         | -          | Config for the Data Connect emulator.                                              |
| - [eventarc](#emulators_eventarc )                   | No      | object  | No         | -          | Config for the EventArc emulator.                                                  |
| - [extensions](#emulators_extensions )               | No      | object  | No         | -          | Placeholder - the Extensions emulator has no configuration options.                |
| - [firestore](#emulators_firestore )                 | No      | object  | No         | -          | Config for the Firestore emulator                                                  |
| - [hosting](#emulators_hosting )                     | No      | object  | No         | -          | Config for the Firebase Hosting emulator                                           |
| - [hub](#emulators_hub )                             | No      | object  | No         | -          | Config for the emulator suite hub.                                                 |
| - [logging](#emulators_logging )                     | No      | object  | No         | -          | Config for the logging emulator.                                                   |
| - [pubsub](#emulators_pubsub )                       | No      | object  | No         | -          | Config for the Pub/Sub emulator                                                    |
| - [singleProjectMode](#emulators_singleProjectMode ) | No      | boolean | No         | -          | If true, the Emulator Suite will only allow a single project to be used at a time. |
| - [storage](#emulators_storage )                     | No      | object  | No         | -          | Config for the Firebase Storage emulator                                           |
| - [tasks](#emulators_tasks )                         | No      | object  | No         | -          | Config for the Cloud Tasks emulator.                                               |
| - [ui](#emulators_ui )                               | No      | object  | No         | -          | Config for the Emulator UI.                                                        |

### <a name="emulators_apphosting"></a>5.1. Property `root > emulators > apphosting`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the App Hosting emulator

| Property                                                              | Pattern | Type   | Deprecated | Definition | Title/Description                                                                      |
| --------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | -------------------------------------------------------------------------------------- |
| - [host](#emulators_apphosting_host )                                 | No      | string | No         | -          | The host that this emulator will serve on.                                             |
| - [port](#emulators_apphosting_port )                                 | No      | number | No         | -          | The port that this emulator will serve on.                                             |
| - [rootDirectory](#emulators_apphosting_rootDirectory )               | No      | string | No         | -          | The root directory of your app. The start command will ran from this directory.        |
| - [startCommand](#emulators_apphosting_startCommand )                 | No      | string | No         | -          | The command that will be run to start your app when emulating your App Hosting backend |
| - [startCommandOverride](#emulators_apphosting_startCommandOverride ) | No      | string | No         | -          | -                                                                                      |

#### <a name="emulators_apphosting_host"></a>5.1.1. Property `root > emulators > apphosting > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_apphosting_port"></a>5.1.2. Property `root > emulators > apphosting > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

#### <a name="emulators_apphosting_rootDirectory"></a>5.1.3. Property `root > emulators > apphosting > rootDirectory`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The root directory of your app. The start command will ran from this directory.

#### <a name="emulators_apphosting_startCommand"></a>5.1.4. Property `root > emulators > apphosting > startCommand`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The command that will be run to start your app when emulating your App Hosting backend

#### <a name="emulators_apphosting_startCommandOverride"></a>5.1.5. Property `root > emulators > apphosting > startCommandOverride`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

### <a name="emulators_auth"></a>5.2. Property `root > emulators > auth`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Auth emulator

| Property                        | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| ------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_auth_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_auth_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_auth_host"></a>5.2.1. Property `root > emulators > auth > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_auth_port"></a>5.2.2. Property `root > emulators > auth > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_database"></a>5.3. Property `root > emulators > database`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Realtime Database emulator

| Property                            | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| ----------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_database_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_database_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_database_host"></a>5.3.1. Property `root > emulators > database > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_database_port"></a>5.3.2. Property `root > emulators > database > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_dataconnect"></a>5.4. Property `root > emulators > dataconnect`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Data Connect emulator.

| Property                                               | Pattern | Type   | Deprecated | Definition | Title/Description                                                                                                                                                                               |
| ------------------------------------------------------ | ------- | ------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [dataDir](#emulators_dataconnect_dataDir )           | No      | string | No         | -          | The directory to persist emulator data to. If set, data will be saved between runs automatically.<br />If the --import flag is used, the current data will be overwritten by the imported data. |
| - [host](#emulators_dataconnect_host )                 | No      | string | No         | -          | The host that this emulator will serve on.                                                                                                                                                      |
| - [port](#emulators_dataconnect_port )                 | No      | number | No         | -          | The port that this emulator will serve on.                                                                                                                                                      |
| - [postgresHost](#emulators_dataconnect_postgresHost ) | No      | string | No         | -          | Host for the Postgres database that backs the Data Connect emulator.                                                                                                                            |
| - [postgresPort](#emulators_dataconnect_postgresPort ) | No      | number | No         | -          | Port for the Postgres database that backs the Data Connect emulator.                                                                                                                            |

#### <a name="emulators_dataconnect_dataDir"></a>5.4.1. Property `root > emulators > dataconnect > dataDir`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The directory to persist emulator data to. If set, data will be saved between runs automatically.
If the --import flag is used, the current data will be overwritten by the imported data.

#### <a name="emulators_dataconnect_host"></a>5.4.2. Property `root > emulators > dataconnect > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_dataconnect_port"></a>5.4.3. Property `root > emulators > dataconnect > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

#### <a name="emulators_dataconnect_postgresHost"></a>5.4.4. Property `root > emulators > dataconnect > postgresHost`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Host for the Postgres database that backs the Data Connect emulator.

#### <a name="emulators_dataconnect_postgresPort"></a>5.4.5. Property `root > emulators > dataconnect > postgresPort`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** Port for the Postgres database that backs the Data Connect emulator.

### <a name="emulators_eventarc"></a>5.5. Property `root > emulators > eventarc`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the EventArc emulator.

| Property                            | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| ----------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_eventarc_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_eventarc_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_eventarc_host"></a>5.5.1. Property `root > emulators > eventarc > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_eventarc_port"></a>5.5.2. Property `root > emulators > eventarc > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_extensions"></a>5.6. Property `root > emulators > extensions`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `object`         |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** Placeholder - the Extensions emulator has no configuration options.

### <a name="emulators_firestore"></a>5.7. Property `root > emulators > firestore`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Firestore emulator

| Property                                               | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| ------------------------------------------------------ | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_firestore_host )                   | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_firestore_port )                   | No      | number | No         | -          | The port that this emulator will serve on. |
| - [websocketPort](#emulators_firestore_websocketPort ) | No      | number | No         | -          | -                                          |

#### <a name="emulators_firestore_host"></a>5.7.1. Property `root > emulators > firestore > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_firestore_port"></a>5.7.2. Property `root > emulators > firestore > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

#### <a name="emulators_firestore_websocketPort"></a>5.7.3. Property `root > emulators > firestore > websocketPort`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

### <a name="emulators_hosting"></a>5.8. Property `root > emulators > hosting`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Firebase Hosting emulator

| Property                           | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| ---------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_hosting_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_hosting_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_hosting_host"></a>5.8.1. Property `root > emulators > hosting > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_hosting_port"></a>5.8.2. Property `root > emulators > hosting > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_hub"></a>5.9. Property `root > emulators > hub`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the emulator suite hub.

| Property                       | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| ------------------------------ | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_hub_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_hub_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_hub_host"></a>5.9.1. Property `root > emulators > hub > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_hub_port"></a>5.9.2. Property `root > emulators > hub > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_logging"></a>5.10. Property `root > emulators > logging`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the logging emulator.

| Property                           | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| ---------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_logging_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_logging_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_logging_host"></a>5.10.1. Property `root > emulators > logging > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_logging_port"></a>5.10.2. Property `root > emulators > logging > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_pubsub"></a>5.11. Property `root > emulators > pubsub`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Pub/Sub emulator

| Property                          | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| --------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_pubsub_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_pubsub_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_pubsub_host"></a>5.11.1. Property `root > emulators > pubsub > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_pubsub_port"></a>5.11.2. Property `root > emulators > pubsub > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_singleProjectMode"></a>5.12. Property `root > emulators > singleProjectMode`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, the Emulator Suite will only allow a single project to be used at a time.

### <a name="emulators_storage"></a>5.13. Property `root > emulators > storage`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Firebase Storage emulator

| Property                           | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| ---------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_storage_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_storage_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_storage_host"></a>5.13.1. Property `root > emulators > storage > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_storage_port"></a>5.13.2. Property `root > emulators > storage > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_tasks"></a>5.14. Property `root > emulators > tasks`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Cloud Tasks emulator.

| Property                         | Pattern | Type   | Deprecated | Definition | Title/Description                          |
| -------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------ |
| - [host](#emulators_tasks_host ) | No      | string | No         | -          | The host that this emulator will serve on. |
| - [port](#emulators_tasks_port ) | No      | number | No         | -          | The port that this emulator will serve on. |

#### <a name="emulators_tasks_host"></a>5.14.1. Property `root > emulators > tasks > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_tasks_port"></a>5.14.2. Property `root > emulators > tasks > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

### <a name="emulators_ui"></a>5.15. Property `root > emulators > ui`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Config for the Emulator UI.

| Property                            | Pattern | Type    | Deprecated | Definition | Title/Description                             |
| ----------------------------------- | ------- | ------- | ---------- | ---------- | --------------------------------------------- |
| - [enabled](#emulators_ui_enabled ) | No      | boolean | No         | -          | If false, the Emulator UI will not be served. |
| - [host](#emulators_ui_host )       | No      | string  | No         | -          | The host that this emulator will serve on.    |
| - [port](#emulators_ui_port )       | No      | number  | No         | -          | The port that this emulator will serve on.    |

#### <a name="emulators_ui_enabled"></a>5.15.1. Property `root > emulators > ui > enabled`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If false, the Emulator UI will not be served.

#### <a name="emulators_ui_host"></a>5.15.2. Property `root > emulators > ui > host`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The host that this emulator will serve on.

#### <a name="emulators_ui_port"></a>5.15.3. Property `root > emulators > ui > port`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** The port that this emulator will serve on.

## <a name="extensions"></a>6. Property `root > extensions`

|                           |                                |
| ------------------------- | ------------------------------ |
| **Type**                  | `object`                       |
| **Required**              | No                             |
| **Additional properties** | Any type allowed               |
| **Defined in**            | #/definitions/ExtensionsConfig |

**Description:** The Firebase Extension(s) that should be deployed or emulated.

## <a name="firestore"></a>7. Property `root > firestore`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** The Firestore rules and indexes that should be deployed or emulated.

| Any of(Option)                         |
| -------------------------------------- |
| [FirestoreSingle](#firestore_anyOf_i0) |
| [item 1](#firestore_anyOf_i1)          |

### <a name="firestore_anyOf_i0"></a>7.1. Property `root > firestore > anyOf > FirestoreSingle`

|                           |                               |
| ------------------------- | ----------------------------- |
| **Type**                  | `object`                      |
| **Required**              | No                            |
| **Additional properties** | Not allowed                   |
| **Defined in**            | #/definitions/FirestoreSingle |

**Description:** Deployment options for a single Firestore database.

| Property                                        | Pattern | Type        | Deprecated | Definition | Title/Description                                                                |
| ----------------------------------------------- | ------- | ----------- | ---------- | ---------- | -------------------------------------------------------------------------------- |
| - [database](#firestore_anyOf_i0_database )     | No      | string      | No         | -          | The id of the Firestore database to deploy. If omitted, defaults to '(default)'  |
| - [indexes](#firestore_anyOf_i0_indexes )       | No      | string      | No         | -          | Path to the firestore indexes file                                               |
| - [location](#firestore_anyOf_i0_location )     | No      | string      | No         | -          | The region of the Firestore database to deploy. Required when 'database' is set. |
| - [postdeploy](#firestore_anyOf_i0_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.     |
| - [predeploy](#firestore_anyOf_i0_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed.    |
| - [rules](#firestore_anyOf_i0_rules )           | No      | string      | No         | -          | Path to the firestore rules file                                                 |

#### <a name="firestore_anyOf_i0_database"></a>7.1.1. Property `root > firestore > anyOf > item 0 > database`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The id of the Firestore database to deploy. If omitted, defaults to '(default)'

#### <a name="firestore_anyOf_i0_indexes"></a>7.1.2. Property `root > firestore > anyOf > item 0 > indexes`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the firestore indexes file

#### <a name="firestore_anyOf_i0_location"></a>7.1.3. Property `root > firestore > anyOf > item 0 > location`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The region of the Firestore database to deploy. Required when 'database' is set.

#### <a name="firestore_anyOf_i0_postdeploy"></a>7.1.4. Property `root > firestore > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                    |
| ------------------------------------------------- |
| [item 0](#firestore_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#firestore_anyOf_i0_postdeploy_anyOf_i1) |

##### <a name="firestore_anyOf_i0_postdeploy_anyOf_i0"></a>7.1.4.1. Property `root > firestore > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                               | Description |
| ------------------------------------------------------------- | ----------- |
| [item 0 items](#firestore_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="firestore_anyOf_i0_postdeploy_anyOf_i0_items"></a>7.1.4.1.1. root > firestore > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="firestore_anyOf_i0_postdeploy_anyOf_i1"></a>7.1.4.2. Property `root > firestore > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="firestore_anyOf_i0_predeploy"></a>7.1.5. Property `root > firestore > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                   |
| ------------------------------------------------ |
| [item 0](#firestore_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#firestore_anyOf_i0_predeploy_anyOf_i1) |

##### <a name="firestore_anyOf_i0_predeploy_anyOf_i0"></a>7.1.5.1. Property `root > firestore > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                              | Description |
| ------------------------------------------------------------ | ----------- |
| [item 0 items](#firestore_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="firestore_anyOf_i0_predeploy_anyOf_i0_items"></a>7.1.5.1.1. root > firestore > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="firestore_anyOf_i0_predeploy_anyOf_i1"></a>7.1.5.2. Property `root > firestore > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="firestore_anyOf_i0_rules"></a>7.1.6. Property `root > firestore > anyOf > item 0 > rules`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the firestore rules file

### <a name="firestore_anyOf_i1"></a>7.2. Property `root > firestore > anyOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Deployment options for a list of Firestore databases.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be           | Description |
| ----------------------------------------- | ----------- |
| [item 1 items](#firestore_anyOf_i1_items) | -           |

#### <a name="firestore_anyOf_i1_items"></a>7.2.1. root > firestore > anyOf > item 1 > item 1 items

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

| Any of(Option)                               |
| -------------------------------------------- |
| [item 0](#firestore_anyOf_i1_items_anyOf_i0) |
| [item 1](#firestore_anyOf_i1_items_anyOf_i1) |

##### <a name="firestore_anyOf_i1_items_anyOf_i0"></a>7.2.1.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                       | Pattern | Type        | Deprecated | Definition | Title/Description                                                                                                                                          |
| -------------------------------------------------------------- | ------- | ----------- | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [database](#firestore_anyOf_i1_items_anyOf_i0_database )     | No      | string      | No         | -          | The ID of the Firestore database to deploy. Required when deploying multiple Firestore databases.                                                          |
| - [indexes](#firestore_anyOf_i1_items_anyOf_i0_indexes )       | No      | string      | No         | -          | Path to the firestore indexes file for this database                                                                                                       |
| - [postdeploy](#firestore_anyOf_i1_items_anyOf_i0_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.                                                                               |
| - [predeploy](#firestore_anyOf_i1_items_anyOf_i0_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed.                                                                              |
| - [rules](#firestore_anyOf_i1_items_anyOf_i0_rules )           | No      | string      | No         | -          | Path to the firestore rules file for this database                                                                                                         |
| + [target](#firestore_anyOf_i1_items_anyOf_i0_target )         | No      | string      | No         | -          | The deploy target these rules and indexes should be deployed to.<br />See https://firebase.google.com/docs/cli/targets to learn more about deploy targets. |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_database"></a>7.2.1.1.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > database`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The ID of the Firestore database to deploy. Required when deploying multiple Firestore databases.

###### <a name="firestore_anyOf_i1_items_anyOf_i0_indexes"></a>7.2.1.1.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > indexes`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the firestore indexes file for this database

###### <a name="firestore_anyOf_i1_items_anyOf_i0_postdeploy"></a>7.2.1.1.3. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                                   |
| ---------------------------------------------------------------- |
| [item 0](#firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1) |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0"></a>7.2.1.1.3.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                              | Description |
| ---------------------------------------------------------------------------- | ----------- |
| [item 0 items](#firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items"></a>7.2.1.1.3.1.1. root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1"></a>7.2.1.1.3.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_predeploy"></a>7.2.1.1.4. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                                  |
| --------------------------------------------------------------- |
| [item 0](#firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1) |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0"></a>7.2.1.1.4.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                             | Description |
| --------------------------------------------------------------------------- | ----------- |
| [item 0 items](#firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items"></a>7.2.1.1.4.1.1. root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1"></a>7.2.1.1.4.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="firestore_anyOf_i1_items_anyOf_i0_rules"></a>7.2.1.1.5. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > rules`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the firestore rules file for this database

###### <a name="firestore_anyOf_i1_items_anyOf_i0_target"></a>7.2.1.1.6. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 0 > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The deploy target these rules and indexes should be deployed to.
See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.

##### <a name="firestore_anyOf_i1_items_anyOf_i1"></a>7.2.1.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                       | Pattern | Type        | Deprecated | Definition | Title/Description                                                                                                                                          |
| -------------------------------------------------------------- | ------- | ----------- | ---------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| + [database](#firestore_anyOf_i1_items_anyOf_i1_database )     | No      | string      | No         | -          | The ID of the Firestore database to deploy. Required when deploying multiple Firestore databases.                                                          |
| - [indexes](#firestore_anyOf_i1_items_anyOf_i1_indexes )       | No      | string      | No         | -          | Path to the firestore indexes file for this database                                                                                                       |
| - [postdeploy](#firestore_anyOf_i1_items_anyOf_i1_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.                                                                               |
| - [predeploy](#firestore_anyOf_i1_items_anyOf_i1_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed.                                                                              |
| - [rules](#firestore_anyOf_i1_items_anyOf_i1_rules )           | No      | string      | No         | -          | Path to the firestore rules file for this database                                                                                                         |
| - [target](#firestore_anyOf_i1_items_anyOf_i1_target )         | No      | string      | No         | -          | The deploy target these rules and indexes should be deployed to.<br />See https://firebase.google.com/docs/cli/targets to learn more about deploy targets. |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_database"></a>7.2.1.2.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > database`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The ID of the Firestore database to deploy. Required when deploying multiple Firestore databases.

###### <a name="firestore_anyOf_i1_items_anyOf_i1_indexes"></a>7.2.1.2.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > indexes`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the firestore indexes file for this database

###### <a name="firestore_anyOf_i1_items_anyOf_i1_postdeploy"></a>7.2.1.2.3. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                                   |
| ---------------------------------------------------------------- |
| [item 0](#firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0) |
| [item 1](#firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1) |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0"></a>7.2.1.2.3.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                              | Description |
| ---------------------------------------------------------------------------- | ----------- |
| [item 0 items](#firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items) | -           |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items"></a>7.2.1.2.3.1.1. root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1"></a>7.2.1.2.3.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_predeploy"></a>7.2.1.2.4. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                                  |
| --------------------------------------------------------------- |
| [item 0](#firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0) |
| [item 1](#firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1) |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0"></a>7.2.1.2.4.1. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                             | Description |
| --------------------------------------------------------------------------- | ----------- |
| [item 0 items](#firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items) | -           |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items"></a>7.2.1.2.4.1.1. root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1"></a>7.2.1.2.4.2. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="firestore_anyOf_i1_items_anyOf_i1_rules"></a>7.2.1.2.5. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > rules`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the firestore rules file for this database

###### <a name="firestore_anyOf_i1_items_anyOf_i1_target"></a>7.2.1.2.6. Property `root > firestore > anyOf > item 1 > item 1 items > anyOf > item 1 > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The deploy target these rules and indexes should be deployed to.
See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.

## <a name="functions"></a>8. Property `root > functions`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** The Cloud Functions for Firebase that should be deployed or emulated.

| Any of(Option)                        |
| ------------------------------------- |
| [FunctionConfig](#functions_anyOf_i0) |
| [item 1](#functions_anyOf_i1)         |

### <a name="functions_anyOf_i0"></a>8.1. Property `root > functions > anyOf > FunctionConfig`

|                           |                              |
| ------------------------- | ---------------------------- |
| **Type**                  | `object`                     |
| **Required**              | No                           |
| **Additional properties** | Not allowed                  |
| **Defined in**            | #/definitions/FunctionConfig |

| Property                                        | Pattern | Type             | Deprecated | Definition | Title/Description                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------- | ---------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| - [codebase](#functions_anyOf_i0_codebase )     | No      | string           | No         | -          | The codebase that these functions are part of. You can use codebases to control which functions are deployed<br /> ie: \`firebase deploy --only functions:my-codebase\`                                                                    |
| - [ignore](#functions_anyOf_i0_ignore )         | No      | array of string  | No         | -          | Files in the source directory that should not be uploaed during dpeloyment.                                                                                                                                                                |
| - [postdeploy](#functions_anyOf_i0_postdeploy ) | No      | Combination      | No         | -          | A script or list of scripts that will be ran after this product is deployed.                                                                                                                                                               |
| - [predeploy](#functions_anyOf_i0_predeploy )   | No      | Combination      | No         | -          | A script or list of scripts that will be ran before this product is deployed.                                                                                                                                                              |
| - [runtime](#functions_anyOf_i0_runtime )       | No      | enum (of string) | No         | -          | The runtime these functions should use.                                                                                                                                                                                                    |
| - [source](#functions_anyOf_i0_source )         | No      | string           | No         | -          | The directory containing your functions source code.<br />This directory will be archived and uploaded during deployment.<br />Files outside of this directory will not be included and should not be referenced from your functions code. |

#### <a name="functions_anyOf_i0_codebase"></a>8.1.1. Property `root > functions > anyOf > item 0 > codebase`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The codebase that these functions are part of. You can use codebases to control which functions are deployed
 ie: `firebase deploy --only functions:my-codebase`

#### <a name="functions_anyOf_i0_ignore"></a>8.1.2. Property `root > functions > anyOf > item 0 > ignore`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** Files in the source directory that should not be uploaed during dpeloyment.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                  | Description |
| ------------------------------------------------ | ----------- |
| [ignore items](#functions_anyOf_i0_ignore_items) | -           |

##### <a name="functions_anyOf_i0_ignore_items"></a>8.1.2.1. root > functions > anyOf > item 0 > ignore > ignore items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="functions_anyOf_i0_postdeploy"></a>8.1.3. Property `root > functions > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                    |
| ------------------------------------------------- |
| [item 0](#functions_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#functions_anyOf_i0_postdeploy_anyOf_i1) |

##### <a name="functions_anyOf_i0_postdeploy_anyOf_i0"></a>8.1.3.1. Property `root > functions > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                               | Description |
| ------------------------------------------------------------- | ----------- |
| [item 0 items](#functions_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="functions_anyOf_i0_postdeploy_anyOf_i0_items"></a>8.1.3.1.1. root > functions > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="functions_anyOf_i0_postdeploy_anyOf_i1"></a>8.1.3.2. Property `root > functions > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="functions_anyOf_i0_predeploy"></a>8.1.4. Property `root > functions > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                   |
| ------------------------------------------------ |
| [item 0](#functions_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#functions_anyOf_i0_predeploy_anyOf_i1) |

##### <a name="functions_anyOf_i0_predeploy_anyOf_i0"></a>8.1.4.1. Property `root > functions > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                              | Description |
| ------------------------------------------------------------ | ----------- |
| [item 0 items](#functions_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="functions_anyOf_i0_predeploy_anyOf_i0_items"></a>8.1.4.1.1. root > functions > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="functions_anyOf_i0_predeploy_anyOf_i1"></a>8.1.4.2. Property `root > functions > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="functions_anyOf_i0_runtime"></a>8.1.5. Property `root > functions > anyOf > item 0 > runtime`

|              |                    |
| ------------ | ------------------ |
| **Type**     | `enum (of string)` |
| **Required** | No                 |

**Description:** The runtime these functions should use.

Must be one of:
* "nodejs20"
* "nodejs22"
* "python310"
* "python311"
* "python312"
* "python313"

#### <a name="functions_anyOf_i0_source"></a>8.1.6. Property `root > functions > anyOf > item 0 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The directory containing your functions source code.
This directory will be archived and uploaded during deployment.
Files outside of this directory will not be included and should not be referenced from your functions code.

### <a name="functions_anyOf_i1"></a>8.2. Property `root > functions > anyOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be             | Description |
| ------------------------------------------- | ----------- |
| [FunctionConfig](#functions_anyOf_i1_items) | -           |

#### <a name="functions_anyOf_i1_items"></a>8.2.1. root > functions > anyOf > item 1 > FunctionConfig

|                           |                                           |
| ------------------------- | ----------------------------------------- |
| **Type**                  | `object`                                  |
| **Required**              | No                                        |
| **Additional properties** | Not allowed                               |
| **Same definition as**    | [functions_anyOf_i0](#functions_anyOf_i0) |

## <a name="hosting"></a>9. Property `root > hosting`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** The Firebase Hosting site(s) that should be deployed or emulated.

| Any of(Option)                     |
| ---------------------------------- |
| [HostingSingle](#hosting_anyOf_i0) |
| [item 1](#hosting_anyOf_i1)        |

### <a name="hosting_anyOf_i0"></a>9.1. Property `root > hosting > anyOf > HostingSingle`

|                           |                             |
| ------------------------- | --------------------------- |
| **Type**                  | `object`                    |
| **Required**              | No                          |
| **Additional properties** | Not allowed                 |
| **Defined in**            | #/definitions/HostingSingle |

**Description:** Deployment options for a single Firebase Hosting site.

| Property                                                    | Pattern | Type             | Deprecated | Definition                                | Title/Description                                                                                                                                                                                         |
| ----------------------------------------------------------- | ------- | ---------------- | ---------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [appAssociation](#hosting_anyOf_i0_appAssociation )       | No      | enum (of string) | No         | -                                         | -                                                                                                                                                                                                         |
| - [cleanUrls](#hosting_anyOf_i0_cleanUrls )                 | No      | boolean          | No         | -                                         | -                                                                                                                                                                                                         |
| - [frameworksBackend](#hosting_anyOf_i0_frameworksBackend ) | No      | object           | No         | In #/definitions/FrameworksBackendOptions | Options for this sites web frameworks backend.                                                                                                                                                            |
| - [headers](#hosting_anyOf_i0_headers )                     | No      | array            | No         | -                                         | A list of extra headers to send when serving specific paths on this site.                                                                                                                                 |
| - [i18n](#hosting_anyOf_i0_i18n )                           | No      | object           | No         | -                                         | Internationalization config for this site.<br />See https://firebase.google.com/docs/hosting/i18n-rewrites#set-up-i18n-rewrites<br />for instructions on how to enable interntionalization for your site. |
| - [ignore](#hosting_anyOf_i0_ignore )                       | No      | array of string  | No         | -                                         | A list of paths or globs within the source directory that should not be included in the uploaded archive.                                                                                                 |
| - [postdeploy](#hosting_anyOf_i0_postdeploy )               | No      | Combination      | No         | -                                         | A script or list of scripts that will be ran after this product is deployed.                                                                                                                              |
| - [predeploy](#hosting_anyOf_i0_predeploy )                 | No      | Combination      | No         | -                                         | A script or list of scripts that will be ran before this product is deployed.                                                                                                                             |
| - [public](#hosting_anyOf_i0_public )                       | No      | string           | No         | -                                         | Whether this site should publically available.                                                                                                                                                            |
| - [redirects](#hosting_anyOf_i0_redirects )                 | No      | array            | No         | -                                         | A list of redirects for this site.                                                                                                                                                                        |
| - [rewrites](#hosting_anyOf_i0_rewrites )                   | No      | array            | No         | -                                         | A list o rewrites for this site.                                                                                                                                                                          |
| - [site](#hosting_anyOf_i0_site )                           | No      | string           | No         | -                                         | The site to deploy.                                                                                                                                                                                       |
| - [source](#hosting_anyOf_i0_source )                       | No      | string           | No         | -                                         | Path to the directory containing this site's source code. This will be archived and uploaded during deployment.                                                                                           |
| - [target](#hosting_anyOf_i0_target )                       | No      | string           | No         | -                                         | The deploy target to deploy.<br />See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.                                                                                    |
| - [trailingSlash](#hosting_anyOf_i0_trailingSlash )         | No      | boolean          | No         | -                                         | -                                                                                                                                                                                                         |

#### <a name="hosting_anyOf_i0_appAssociation"></a>9.1.1. Property `root > hosting > anyOf > item 0 > appAssociation`

|              |                    |
| ------------ | ------------------ |
| **Type**     | `enum (of string)` |
| **Required** | No                 |

Must be one of:
* "AUTO"
* "NONE"

#### <a name="hosting_anyOf_i0_cleanUrls"></a>9.1.2. Property `root > hosting > anyOf > item 0 > cleanUrls`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

#### <a name="hosting_anyOf_i0_frameworksBackend"></a>9.1.3. Property `root > hosting > anyOf > item 0 > frameworksBackend`

|                           |                                        |
| ------------------------- | -------------------------------------- |
| **Type**                  | `object`                               |
| **Required**              | No                                     |
| **Additional properties** | Not allowed                            |
| **Defined in**            | #/definitions/FrameworksBackendOptions |

**Description:** Options for this sites web frameworks backend.

| Property                                                                                        | Pattern | Type              | Deprecated | Definition                             | Title/Description                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ------- | ----------------- | ---------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [concurrency](#hosting_anyOf_i0_frameworksBackend_concurrency )                               | No      | number            | No         | -                                      | Number of requests a function can serve at once.                                                                                                                                                                                                                                                                                              |
| - [cors](#hosting_anyOf_i0_frameworksBackend_cors )                                             | No      | string or boolean | No         | -                                      | If true, allows CORS on requests to this function.<br />If this is a \`string\` or \`RegExp\`, allows requests from domains that match the provided value.<br />If this is an \`Array\`, allows requests from domains matching at least one entry of the array.<br />Defaults to true for {@link https.CallableFunction} and false otherwise. |
| - [cpu](#hosting_anyOf_i0_frameworksBackend_cpu )                                               | No      | Combination       | No         | -                                      | Fractional number of CPUs to allocate to a function.                                                                                                                                                                                                                                                                                          |
| - [enforceAppCheck](#hosting_anyOf_i0_frameworksBackend_enforceAppCheck )                       | No      | boolean           | No         | -                                      | Determines whether Firebase AppCheck is enforced. Defaults to false.                                                                                                                                                                                                                                                                          |
| - [ingressSettings](#hosting_anyOf_i0_frameworksBackend_ingressSettings )                       | No      | enum (of string)  | No         | -                                      | Ingress settings which control where this function can be called from.                                                                                                                                                                                                                                                                        |
| - [invoker](#hosting_anyOf_i0_frameworksBackend_invoker )                                       | No      | const             | No         | -                                      | Invoker to set access control on https functions.                                                                                                                                                                                                                                                                                             |
| - [labels](#hosting_anyOf_i0_frameworksBackend_labels )                                         | No      | object            | No         | In #/definitions/Record<string,string> | User labels to set on the function.                                                                                                                                                                                                                                                                                                           |
| - [maxInstances](#hosting_anyOf_i0_frameworksBackend_maxInstances )                             | No      | number            | No         | -                                      | Max number of instances to be running in parallel.                                                                                                                                                                                                                                                                                            |
| - [memory](#hosting_anyOf_i0_frameworksBackend_memory )                                         | No      | enum (of string)  | No         | -                                      | Amount of memory to allocate to a function.                                                                                                                                                                                                                                                                                                   |
| - [minInstances](#hosting_anyOf_i0_frameworksBackend_minInstances )                             | No      | number            | No         | -                                      | Min number of actual instances to be running at a given time.                                                                                                                                                                                                                                                                                 |
| - [omit](#hosting_anyOf_i0_frameworksBackend_omit )                                             | No      | boolean           | No         | -                                      | If true, do not deploy or emulate this function.                                                                                                                                                                                                                                                                                              |
| - [preserveExternalChanges](#hosting_anyOf_i0_frameworksBackend_preserveExternalChanges )       | No      | boolean           | No         | -                                      | Controls whether function configuration modified outside of function source is preserved. Defaults to false.                                                                                                                                                                                                                                  |
| - [region](#hosting_anyOf_i0_frameworksBackend_region )                                         | No      | string            | No         | -                                      | HTTP functions can override global options and can specify multiple regions to deploy to.                                                                                                                                                                                                                                                     |
| - [secrets](#hosting_anyOf_i0_frameworksBackend_secrets )                                       | No      | array of string   | No         | -                                      | A list of secrets used in this app.                                                                                                                                                                                                                                                                                                           |
| - [serviceAccount](#hosting_anyOf_i0_frameworksBackend_serviceAccount )                         | No      | string            | No         | -                                      | Specific service account for the function to run as.                                                                                                                                                                                                                                                                                          |
| - [timeoutSeconds](#hosting_anyOf_i0_frameworksBackend_timeoutSeconds )                         | No      | number            | No         | -                                      | Timeout for the function in seconds, possible values are 0 to 540.<br />HTTPS functions can specify a higher timeout.                                                                                                                                                                                                                         |
| - [vpcConnector](#hosting_anyOf_i0_frameworksBackend_vpcConnector )                             | No      | string            | No         | -                                      | Connect cloud function to specified VPC connector.                                                                                                                                                                                                                                                                                            |
| - [vpcConnectorEgressSettings](#hosting_anyOf_i0_frameworksBackend_vpcConnectorEgressSettings ) | No      | enum (of string)  | No         | -                                      | Egress settings for VPC connector.                                                                                                                                                                                                                                                                                                            |

##### <a name="hosting_anyOf_i0_frameworksBackend_concurrency"></a>9.1.3.1. Property `root > hosting > anyOf > item 0 > frameworksBackend > concurrency`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** Number of requests a function can serve at once.

##### <a name="hosting_anyOf_i0_frameworksBackend_cors"></a>9.1.3.2. Property `root > hosting > anyOf > item 0 > frameworksBackend > cors`

|              |                     |
| ------------ | ------------------- |
| **Type**     | `string or boolean` |
| **Required** | No                  |

**Description:** If true, allows CORS on requests to this function.
If this is a `string` or `RegExp`, allows requests from domains that match the provided value.
If this is an `Array`, allows requests from domains matching at least one entry of the array.
Defaults to true for {@link https.CallableFunction} and false otherwise.

##### <a name="hosting_anyOf_i0_frameworksBackend_cpu"></a>9.1.3.3. Property `root > hosting > anyOf > item 0 > frameworksBackend > cpu`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** Fractional number of CPUs to allocate to a function.

| Any of(Option)                                             |
| ---------------------------------------------------------- |
| [item 0](#hosting_anyOf_i0_frameworksBackend_cpu_anyOf_i0) |
| [item 1](#hosting_anyOf_i0_frameworksBackend_cpu_anyOf_i1) |

###### <a name="hosting_anyOf_i0_frameworksBackend_cpu_anyOf_i0"></a>9.1.3.3.1. Property `root > hosting > anyOf > item 0 > frameworksBackend > cpu > anyOf > item 0`

|              |         |
| ------------ | ------- |
| **Type**     | `const` |
| **Required** | No      |

Specific value: `"gcf_gen1"`

###### <a name="hosting_anyOf_i0_frameworksBackend_cpu_anyOf_i1"></a>9.1.3.3.2. Property `root > hosting > anyOf > item 0 > frameworksBackend > cpu > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

##### <a name="hosting_anyOf_i0_frameworksBackend_enforceAppCheck"></a>9.1.3.4. Property `root > hosting > anyOf > item 0 > frameworksBackend > enforceAppCheck`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Determines whether Firebase AppCheck is enforced. Defaults to false.

##### <a name="hosting_anyOf_i0_frameworksBackend_ingressSettings"></a>9.1.3.5. Property `root > hosting > anyOf > item 0 > frameworksBackend > ingressSettings`

|              |                    |
| ------------ | ------------------ |
| **Type**     | `enum (of string)` |
| **Required** | No                 |

**Description:** Ingress settings which control where this function can be called from.

Must be one of:
* "ALLOW_ALL"
* "ALLOW_INTERNAL_AND_GCLB"
* "ALLOW_INTERNAL_ONLY"

##### <a name="hosting_anyOf_i0_frameworksBackend_invoker"></a>9.1.3.6. Property `root > hosting > anyOf > item 0 > frameworksBackend > invoker`

|              |         |
| ------------ | ------- |
| **Type**     | `const` |
| **Required** | No      |

**Description:** Invoker to set access control on https functions.

Specific value: `"public"`

##### <a name="hosting_anyOf_i0_frameworksBackend_labels"></a>9.1.3.7. Property `root > hosting > anyOf > item 0 > frameworksBackend > labels`

|                           |                                     |
| ------------------------- | ----------------------------------- |
| **Type**                  | `object`                            |
| **Required**              | No                                  |
| **Additional properties** | Any type allowed                    |
| **Defined in**            | #/definitions/Record<string,string> |

**Description:** User labels to set on the function.

##### <a name="hosting_anyOf_i0_frameworksBackend_maxInstances"></a>9.1.3.8. Property `root > hosting > anyOf > item 0 > frameworksBackend > maxInstances`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** Max number of instances to be running in parallel.

##### <a name="hosting_anyOf_i0_frameworksBackend_memory"></a>9.1.3.9. Property `root > hosting > anyOf > item 0 > frameworksBackend > memory`

|              |                    |
| ------------ | ------------------ |
| **Type**     | `enum (of string)` |
| **Required** | No                 |

**Description:** Amount of memory to allocate to a function.

Must be one of:
* "128MiB"
* "16GiB"
* "1GiB"
* "256MiB"
* "2GiB"
* "32GiB"
* "4GiB"
* "512MiB"
* "8GiB"

##### <a name="hosting_anyOf_i0_frameworksBackend_minInstances"></a>9.1.3.10. Property `root > hosting > anyOf > item 0 > frameworksBackend > minInstances`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** Min number of actual instances to be running at a given time.

##### <a name="hosting_anyOf_i0_frameworksBackend_omit"></a>9.1.3.11. Property `root > hosting > anyOf > item 0 > frameworksBackend > omit`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, do not deploy or emulate this function.

##### <a name="hosting_anyOf_i0_frameworksBackend_preserveExternalChanges"></a>9.1.3.12. Property `root > hosting > anyOf > item 0 > frameworksBackend > preserveExternalChanges`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** Controls whether function configuration modified outside of function source is preserved. Defaults to false.

##### <a name="hosting_anyOf_i0_frameworksBackend_region"></a>9.1.3.13. Property `root > hosting > anyOf > item 0 > frameworksBackend > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** HTTP functions can override global options and can specify multiple regions to deploy to.

##### <a name="hosting_anyOf_i0_frameworksBackend_secrets"></a>9.1.3.14. Property `root > hosting > anyOf > item 0 > frameworksBackend > secrets`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** A list of secrets used in this app.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                    | Description |
| ------------------------------------------------------------------ | ----------- |
| [secrets items](#hosting_anyOf_i0_frameworksBackend_secrets_items) | -           |

###### <a name="hosting_anyOf_i0_frameworksBackend_secrets_items"></a>9.1.3.14.1. root > hosting > anyOf > item 0 > frameworksBackend > secrets > secrets items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="hosting_anyOf_i0_frameworksBackend_serviceAccount"></a>9.1.3.15. Property `root > hosting > anyOf > item 0 > frameworksBackend > serviceAccount`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Specific service account for the function to run as.

##### <a name="hosting_anyOf_i0_frameworksBackend_timeoutSeconds"></a>9.1.3.16. Property `root > hosting > anyOf > item 0 > frameworksBackend > timeoutSeconds`

|              |          |
| ------------ | -------- |
| **Type**     | `number` |
| **Required** | No       |

**Description:** Timeout for the function in seconds, possible values are 0 to 540.
HTTPS functions can specify a higher timeout.

##### <a name="hosting_anyOf_i0_frameworksBackend_vpcConnector"></a>9.1.3.17. Property `root > hosting > anyOf > item 0 > frameworksBackend > vpcConnector`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Connect cloud function to specified VPC connector.

##### <a name="hosting_anyOf_i0_frameworksBackend_vpcConnectorEgressSettings"></a>9.1.3.18. Property `root > hosting > anyOf > item 0 > frameworksBackend > vpcConnectorEgressSettings`

|              |                    |
| ------------ | ------------------ |
| **Type**     | `enum (of string)` |
| **Required** | No                 |

**Description:** Egress settings for VPC connector.

Must be one of:
* "ALL_TRAFFIC"
* "PRIVATE_RANGES_ONLY"

#### <a name="hosting_anyOf_i0_headers"></a>9.1.4. Property `root > hosting > anyOf > item 0 > headers`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list of extra headers to send when serving specific paths on this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                   | Description                                               |
| ------------------------------------------------- | --------------------------------------------------------- |
| [HostingHeaders](#hosting_anyOf_i0_headers_items) | Extra headers that should be sent when serving this path. |

##### <a name="hosting_anyOf_i0_headers_items"></a>9.1.4.1. root > hosting > anyOf > item 0 > headers > HostingHeaders

|                           |                              |
| ------------------------- | ---------------------------- |
| **Type**                  | `combining`                  |
| **Required**              | No                           |
| **Additional properties** | Any type allowed             |
| **Defined in**            | #/definitions/HostingHeaders |

**Description:** Extra headers that should be sent when serving this path.

| Any of(Option)                                     |
| -------------------------------------------------- |
| [item 0](#hosting_anyOf_i0_headers_items_anyOf_i0) |
| [item 1](#hosting_anyOf_i0_headers_items_anyOf_i1) |
| [item 2](#hosting_anyOf_i0_headers_items_anyOf_i2) |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i0"></a>9.1.4.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                       | Pattern | Type            | Deprecated | Definition | Title/Description                                                      |
| -------------------------------------------------------------- | ------- | --------------- | ---------- | ---------- | ---------------------------------------------------------------------- |
| + [glob](#hosting_anyOf_i0_headers_items_anyOf_i0_glob )       | No      | string          | No         | -          | A glob pattern describing the paths that this setting should apply to. |
| + [headers](#hosting_anyOf_i0_headers_items_anyOf_i0_headers ) | No      | array of object | No         | -          | -                                                                      |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i0_glob"></a>9.1.4.1.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > glob`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A glob pattern describing the paths that this setting should apply to.

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i0_headers"></a>9.1.4.1.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > headers`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of object` |
| **Required** | Yes               |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                         | Description |
| ----------------------------------------------------------------------- | ----------- |
| [headers items](#hosting_anyOf_i0_headers_items_anyOf_i0_headers_items) | -           |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i0_headers_items"></a>9.1.4.1.1.2.1. root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > headers > headers items

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                 | Pattern | Type   | Deprecated | Definition | Title/Description                |
| ------------------------------------------------------------------------ | ------- | ------ | ---------- | ---------- | -------------------------------- |
| + [key](#hosting_anyOf_i0_headers_items_anyOf_i0_headers_items_key )     | No      | string | No         | -          | The header to set.               |
| + [value](#hosting_anyOf_i0_headers_items_anyOf_i0_headers_items_value ) | No      | string | No         | -          | The value to set this header to. |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i0_headers_items_key"></a>9.1.4.1.1.2.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > headers > headers items > key`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The header to set.

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i0_headers_items_value"></a>9.1.4.1.1.2.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 0 > headers > headers items > value`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The value to set this header to.

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i1"></a>9.1.4.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                       | Pattern | Type            | Deprecated | Definition | Title/Description                              |
| -------------------------------------------------------------- | ------- | --------------- | ---------- | ---------- | ---------------------------------------------- |
| + [headers](#hosting_anyOf_i0_headers_items_anyOf_i1_headers ) | No      | array of object | No         | -          | -                                              |
| + [source](#hosting_anyOf_i0_headers_items_anyOf_i1_source )   | No      | string          | No         | -          | A file path that this setting should apply to. |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i1_headers"></a>9.1.4.1.2.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > headers`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of object` |
| **Required** | Yes               |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                         | Description |
| ----------------------------------------------------------------------- | ----------- |
| [headers items](#hosting_anyOf_i0_headers_items_anyOf_i1_headers_items) | -           |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i1_headers_items"></a>9.1.4.1.2.1.1. root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > headers > headers items

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                 | Pattern | Type   | Deprecated | Definition | Title/Description                |
| ------------------------------------------------------------------------ | ------- | ------ | ---------- | ---------- | -------------------------------- |
| + [key](#hosting_anyOf_i0_headers_items_anyOf_i1_headers_items_key )     | No      | string | No         | -          | The header to set.               |
| + [value](#hosting_anyOf_i0_headers_items_anyOf_i1_headers_items_value ) | No      | string | No         | -          | The value to set this header to. |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i1_headers_items_key"></a>9.1.4.1.2.1.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > headers > headers items > key`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The header to set.

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i1_headers_items_value"></a>9.1.4.1.2.1.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > headers > headers items > value`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The value to set this header to.

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i1_source"></a>9.1.4.1.2.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 1 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A file path that this setting should apply to.

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i2"></a>9.1.4.1.3. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                       | Pattern | Type            | Deprecated | Definition | Title/Description                                                           |
| -------------------------------------------------------------- | ------- | --------------- | ---------- | ---------- | --------------------------------------------------------------------------- |
| + [headers](#hosting_anyOf_i0_headers_items_anyOf_i2_headers ) | No      | array of object | No         | -          | -                                                                           |
| + [regex](#hosting_anyOf_i0_headers_items_anyOf_i2_regex )     | No      | string          | No         | -          | A regex pattern that matches the paths that this setting should apply to. * |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i2_headers"></a>9.1.4.1.3.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > headers`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of object` |
| **Required** | Yes               |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                         | Description |
| ----------------------------------------------------------------------- | ----------- |
| [headers items](#hosting_anyOf_i0_headers_items_anyOf_i2_headers_items) | -           |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i2_headers_items"></a>9.1.4.1.3.1.1. root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > headers > headers items

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                 | Pattern | Type   | Deprecated | Definition | Title/Description                |
| ------------------------------------------------------------------------ | ------- | ------ | ---------- | ---------- | -------------------------------- |
| + [key](#hosting_anyOf_i0_headers_items_anyOf_i2_headers_items_key )     | No      | string | No         | -          | The header to set.               |
| + [value](#hosting_anyOf_i0_headers_items_anyOf_i2_headers_items_value ) | No      | string | No         | -          | The value to set this header to. |

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i2_headers_items_key"></a>9.1.4.1.3.1.1.1. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > headers > headers items > key`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The header to set.

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i2_headers_items_value"></a>9.1.4.1.3.1.1.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > headers > headers items > value`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The value to set this header to.

###### <a name="hosting_anyOf_i0_headers_items_anyOf_i2_regex"></a>9.1.4.1.3.2. Property `root > hosting > anyOf > item 0 > headers > headers items > anyOf > item 2 > regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A regex pattern that matches the paths that this setting should apply to. *

#### <a name="hosting_anyOf_i0_i18n"></a>9.1.5. Property `root > hosting > anyOf > item 0 > i18n`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Internationalization config for this site.
See https://firebase.google.com/docs/hosting/i18n-rewrites#set-up-i18n-rewrites
for instructions on how to enable interntionalization for your site.

| Property                               | Pattern | Type   | Deprecated | Definition | Title/Description                                       |
| -------------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------------------- |
| + [root](#hosting_anyOf_i0_i18n_root ) | No      | string | No         | -          | The directory containing internationalization rewrites. |

##### <a name="hosting_anyOf_i0_i18n_root"></a>9.1.5.1. Property `root > hosting > anyOf > item 0 > i18n > root`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The directory containing internationalization rewrites.

#### <a name="hosting_anyOf_i0_ignore"></a>9.1.6. Property `root > hosting > anyOf > item 0 > ignore`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** A list of paths or globs within the source directory that should not be included in the uploaded archive.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                | Description |
| ---------------------------------------------- | ----------- |
| [ignore items](#hosting_anyOf_i0_ignore_items) | -           |

##### <a name="hosting_anyOf_i0_ignore_items"></a>9.1.6.1. root > hosting > anyOf > item 0 > ignore > ignore items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="hosting_anyOf_i0_postdeploy"></a>9.1.7. Property `root > hosting > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                  |
| ----------------------------------------------- |
| [item 0](#hosting_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#hosting_anyOf_i0_postdeploy_anyOf_i1) |

##### <a name="hosting_anyOf_i0_postdeploy_anyOf_i0"></a>9.1.7.1. Property `root > hosting > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                             | Description |
| ----------------------------------------------------------- | ----------- |
| [item 0 items](#hosting_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="hosting_anyOf_i0_postdeploy_anyOf_i0_items"></a>9.1.7.1.1. root > hosting > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="hosting_anyOf_i0_postdeploy_anyOf_i1"></a>9.1.7.2. Property `root > hosting > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="hosting_anyOf_i0_predeploy"></a>9.1.8. Property `root > hosting > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                 |
| ---------------------------------------------- |
| [item 0](#hosting_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#hosting_anyOf_i0_predeploy_anyOf_i1) |

##### <a name="hosting_anyOf_i0_predeploy_anyOf_i0"></a>9.1.8.1. Property `root > hosting > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                            | Description |
| ---------------------------------------------------------- | ----------- |
| [item 0 items](#hosting_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="hosting_anyOf_i0_predeploy_anyOf_i0_items"></a>9.1.8.1.1. root > hosting > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="hosting_anyOf_i0_predeploy_anyOf_i1"></a>9.1.8.2. Property `root > hosting > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="hosting_anyOf_i0_public"></a>9.1.9. Property `root > hosting > anyOf > item 0 > public`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Whether this site should publically available.

#### <a name="hosting_anyOf_i0_redirects"></a>9.1.10. Property `root > hosting > anyOf > item 0 > redirects`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list of redirects for this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                       | Description                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [HostingRedirects](#hosting_anyOf_i0_redirects_items) | URL redirects for a hosting site. Use these to prevent broken links when moving pages. |

##### <a name="hosting_anyOf_i0_redirects_items"></a>9.1.10.1. root > hosting > anyOf > item 0 > redirects > HostingRedirects

|                           |                                |
| ------------------------- | ------------------------------ |
| **Type**                  | `combining`                    |
| **Required**              | No                             |
| **Additional properties** | Any type allowed               |
| **Defined in**            | #/definitions/HostingRedirects |

**Description:** URL redirects for a hosting site. Use these to prevent broken links when moving pages.

| Any of(Option)                                       |
| ---------------------------------------------------- |
| [item 0](#hosting_anyOf_i0_redirects_items_anyOf_i0) |
| [item 1](#hosting_anyOf_i0_redirects_items_anyOf_i1) |
| [item 2](#hosting_anyOf_i0_redirects_items_anyOf_i2) |

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i0"></a>9.1.10.1.1. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 0`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                 | Pattern | Type              | Deprecated | Definition | Title/Description                                                                                  |
| ------------------------------------------------------------------------ | ------- | ----------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------- |
| + [destination](#hosting_anyOf_i0_redirects_items_anyOf_i0_destination ) | No      | string            | No         | -          | The destination to redirect to.                                                                    |
| + [glob](#hosting_anyOf_i0_redirects_items_anyOf_i0_glob )               | No      | string            | No         | -          | A glob pattern describing the paths that this setting should apply to.                             |
| - [type](#hosting_anyOf_i0_redirects_items_anyOf_i0_type )               | No      | enum (of integer) | No         | -          | The type of redirect.<br />Use 301 for 'Moved Permanently' or 302 for 'Found' (Temporary Redirect) |

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i0_destination"></a>9.1.10.1.1.1. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 0 > destination`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The destination to redirect to.

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i0_glob"></a>9.1.10.1.1.2. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 0 > glob`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A glob pattern describing the paths that this setting should apply to.

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i0_type"></a>9.1.10.1.1.3. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 0 > type`

|              |                     |
| ------------ | ------------------- |
| **Type**     | `enum (of integer)` |
| **Required** | No                  |

**Description:** The type of redirect.
Use 301 for 'Moved Permanently' or 302 for 'Found' (Temporary Redirect)

Must be one of:
* 301
* 302

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i1"></a>9.1.10.1.2. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 1`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                 | Pattern | Type              | Deprecated | Definition | Title/Description                                                                                  |
| ------------------------------------------------------------------------ | ------- | ----------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------- |
| + [destination](#hosting_anyOf_i0_redirects_items_anyOf_i1_destination ) | No      | string            | No         | -          | The destination to redirect to.                                                                    |
| + [source](#hosting_anyOf_i0_redirects_items_anyOf_i1_source )           | No      | string            | No         | -          | A file path that this setting should apply to.                                                     |
| - [type](#hosting_anyOf_i0_redirects_items_anyOf_i1_type )               | No      | enum (of integer) | No         | -          | The type of redirect.<br />Use 301 for 'Moved Permanently' or 302 for 'Found' (Temporary Redirect) |

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i1_destination"></a>9.1.10.1.2.1. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 1 > destination`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The destination to redirect to.

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i1_source"></a>9.1.10.1.2.2. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 1 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A file path that this setting should apply to.

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i1_type"></a>9.1.10.1.2.3. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 1 > type`

|              |                     |
| ------------ | ------------------- |
| **Type**     | `enum (of integer)` |
| **Required** | No                  |

**Description:** The type of redirect.
Use 301 for 'Moved Permanently' or 302 for 'Found' (Temporary Redirect)

Must be one of:
* 301
* 302

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i2"></a>9.1.10.1.3. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 2`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                 | Pattern | Type              | Deprecated | Definition | Title/Description                                                                                  |
| ------------------------------------------------------------------------ | ------- | ----------------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------- |
| + [destination](#hosting_anyOf_i0_redirects_items_anyOf_i2_destination ) | No      | string            | No         | -          | The destination to redirect to.                                                                    |
| + [regex](#hosting_anyOf_i0_redirects_items_anyOf_i2_regex )             | No      | string            | No         | -          | A regex pattern that matches the paths that this setting should apply to. *                        |
| - [type](#hosting_anyOf_i0_redirects_items_anyOf_i2_type )               | No      | enum (of integer) | No         | -          | The type of redirect.<br />Use 301 for 'Moved Permanently' or 302 for 'Found' (Temporary Redirect) |

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i2_destination"></a>9.1.10.1.3.1. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 2 > destination`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The destination to redirect to.

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i2_regex"></a>9.1.10.1.3.2. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 2 > regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A regex pattern that matches the paths that this setting should apply to. *

###### <a name="hosting_anyOf_i0_redirects_items_anyOf_i2_type"></a>9.1.10.1.3.3. Property `root > hosting > anyOf > item 0 > redirects > redirects items > anyOf > item 2 > type`

|              |                     |
| ------------ | ------------------- |
| **Type**     | `enum (of integer)` |
| **Required** | No                  |

**Description:** The type of redirect.
Use 301 for 'Moved Permanently' or 302 for 'Found' (Temporary Redirect)

Must be one of:
* 301
* 302

#### <a name="hosting_anyOf_i0_rewrites"></a>9.1.11. Property `root > hosting > anyOf > item 0 > rewrites`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list o rewrites for this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                     | Description                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [HostingRewrites](#hosting_anyOf_i0_rewrites_items) | Defines a Hosting rewrite. Rewrites allow you to redirect URLs to a different path, Cloud function or Cloud Run service. |

##### <a name="hosting_anyOf_i0_rewrites_items"></a>9.1.11.1. root > hosting > anyOf > item 0 > rewrites > HostingRewrites

|                           |                               |
| ------------------------- | ----------------------------- |
| **Type**                  | `combining`                   |
| **Required**              | No                            |
| **Additional properties** | Any type allowed              |
| **Defined in**            | #/definitions/HostingRewrites |

**Description:** Defines a Hosting rewrite. Rewrites allow you to redirect URLs to a different path, Cloud function or Cloud Run service.

| Any of(Option)                                        |
| ----------------------------------------------------- |
| [item 0](#hosting_anyOf_i0_rewrites_items_anyOf_i0)   |
| [item 1](#hosting_anyOf_i0_rewrites_items_anyOf_i1)   |
| [item 2](#hosting_anyOf_i0_rewrites_items_anyOf_i2)   |
| [item 3](#hosting_anyOf_i0_rewrites_items_anyOf_i3)   |
| [item 4](#hosting_anyOf_i0_rewrites_items_anyOf_i4)   |
| [item 5](#hosting_anyOf_i0_rewrites_items_anyOf_i5)   |
| [item 6](#hosting_anyOf_i0_rewrites_items_anyOf_i6)   |
| [item 7](#hosting_anyOf_i0_rewrites_items_anyOf_i7)   |
| [item 8](#hosting_anyOf_i0_rewrites_items_anyOf_i8)   |
| [item 9](#hosting_anyOf_i0_rewrites_items_anyOf_i9)   |
| [item 10](#hosting_anyOf_i0_rewrites_items_anyOf_i10) |
| [item 11](#hosting_anyOf_i0_rewrites_items_anyOf_i11) |
| [item 12](#hosting_anyOf_i0_rewrites_items_anyOf_i12) |
| [item 13](#hosting_anyOf_i0_rewrites_items_anyOf_i13) |
| [item 14](#hosting_anyOf_i0_rewrites_items_anyOf_i14) |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i0"></a>9.1.11.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 0`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                | Pattern | Type   | Deprecated | Definition | Title/Description                                                      |
| ----------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------------------------------- |
| + [destination](#hosting_anyOf_i0_rewrites_items_anyOf_i0_destination ) | No      | string | No         | -          | -                                                                      |
| + [glob](#hosting_anyOf_i0_rewrites_items_anyOf_i0_glob )               | No      | string | No         | -          | A glob pattern describing the paths that this setting should apply to. |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i0_destination"></a>9.1.11.1.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 0 > destination`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i0_glob"></a>9.1.11.1.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 0 > glob`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A glob pattern describing the paths that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i1"></a>9.1.11.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 1`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                          | Pattern | Type   | Deprecated | Definition | Title/Description                                                      |
| ----------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------------------------------- |
| + [function](#hosting_anyOf_i0_rewrites_items_anyOf_i1_function ) | No      | string | No         | -          | -                                                                      |
| + [glob](#hosting_anyOf_i0_rewrites_items_anyOf_i1_glob )         | No      | string | No         | -          | A glob pattern describing the paths that this setting should apply to. |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i1_region )     | No      | string | No         | -          | -                                                                      |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i1_function"></a>9.1.11.1.2.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 1 > function`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i1_glob"></a>9.1.11.1.2.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 1 > glob`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A glob pattern describing the paths that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i1_region"></a>9.1.11.1.2.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 1 > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i2"></a>9.1.11.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                          | Pattern | Type   | Deprecated | Definition | Title/Description                                                      |
| ----------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------------------------------- |
| + [function](#hosting_anyOf_i0_rewrites_items_anyOf_i2_function ) | No      | object | No         | -          | -                                                                      |
| + [glob](#hosting_anyOf_i0_rewrites_items_anyOf_i2_glob )         | No      | string | No         | -          | A glob pattern describing the paths that this setting should apply to. |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i2_function"></a>9.1.11.1.3.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > function`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | Yes         |
| **Additional properties** | Not allowed |

| Property                                                                       | Pattern | Type    | Deprecated | Definition | Title/Description                                                                           |
| ------------------------------------------------------------------------------ | ------- | ------- | ---------- | ---------- | ------------------------------------------------------------------------------------------- |
| + [functionId](#hosting_anyOf_i0_rewrites_items_anyOf_i2_function_functionId ) | No      | string  | No         | -          | The ID of the Cloud Function to rewrite to.                                                 |
| - [pinTag](#hosting_anyOf_i0_rewrites_items_anyOf_i2_function_pinTag )         | No      | boolean | No         | -          | If true, the rewrite will be pinned to the currently running version of the Cloud Function. |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i2_function_region )         | No      | string  | No         | -          | -                                                                                           |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i2_function_functionId"></a>9.1.11.1.3.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > function > functionId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The ID of the Cloud Function to rewrite to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i2_function_pinTag"></a>9.1.11.1.3.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > function > pinTag`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, the rewrite will be pinned to the currently running version of the Cloud Function.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i2_function_region"></a>9.1.11.1.3.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > function > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i2_glob"></a>9.1.11.1.3.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 2 > glob`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A glob pattern describing the paths that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i3"></a>9.1.11.1.4. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                  | Pattern | Type   | Deprecated | Definition | Title/Description                                                      |
| --------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------------------------------- |
| + [glob](#hosting_anyOf_i0_rewrites_items_anyOf_i3_glob ) | No      | string | No         | -          | A glob pattern describing the paths that this setting should apply to. |
| + [run](#hosting_anyOf_i0_rewrites_items_anyOf_i3_run )   | No      | object | No         | -          | -                                                                      |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i3_glob"></a>9.1.11.1.4.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > glob`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A glob pattern describing the paths that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i3_run"></a>9.1.11.1.4.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > run`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | Yes         |
| **Additional properties** | Not allowed |

| Property                                                                | Pattern | Type    | Deprecated | Definition | Title/Description                                                                               |
| ----------------------------------------------------------------------- | ------- | ------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------- |
| - [pinTag](#hosting_anyOf_i0_rewrites_items_anyOf_i3_run_pinTag )       | No      | boolean | No         | -          | If true, the rewrite will be pinned to the currently running revision of the Cloud Run service. |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i3_run_region )       | No      | string  | No         | -          | -                                                                                               |
| + [serviceId](#hosting_anyOf_i0_rewrites_items_anyOf_i3_run_serviceId ) | No      | string  | No         | -          | The ID of the Cloud Run service to rewrite to.                                                  |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i3_run_pinTag"></a>9.1.11.1.4.2.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > run > pinTag`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, the rewrite will be pinned to the currently running revision of the Cloud Run service.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i3_run_region"></a>9.1.11.1.4.2.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > run > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i3_run_serviceId"></a>9.1.11.1.4.2.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 3 > run > serviceId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The ID of the Cloud Run service to rewrite to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i4"></a>9.1.11.1.5. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 4`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                  | Pattern | Type    | Deprecated | Definition | Title/Description                                                      |
| ------------------------------------------------------------------------- | ------- | ------- | ---------- | ---------- | ---------------------------------------------------------------------- |
| + [dynamicLinks](#hosting_anyOf_i0_rewrites_items_anyOf_i4_dynamicLinks ) | No      | boolean | No         | -          | -                                                                      |
| + [glob](#hosting_anyOf_i0_rewrites_items_anyOf_i4_glob )                 | No      | string  | No         | -          | A glob pattern describing the paths that this setting should apply to. |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i4_dynamicLinks"></a>9.1.11.1.5.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 4 > dynamicLinks`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | Yes       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i4_glob"></a>9.1.11.1.5.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 4 > glob`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A glob pattern describing the paths that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i5"></a>9.1.11.1.6. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 5`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                | Pattern | Type   | Deprecated | Definition | Title/Description                              |
| ----------------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------- |
| + [destination](#hosting_anyOf_i0_rewrites_items_anyOf_i5_destination ) | No      | string | No         | -          | -                                              |
| + [source](#hosting_anyOf_i0_rewrites_items_anyOf_i5_source )           | No      | string | No         | -          | A file path that this setting should apply to. |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i5_destination"></a>9.1.11.1.6.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 5 > destination`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i5_source"></a>9.1.11.1.6.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 5 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A file path that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i6"></a>9.1.11.1.7. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 6`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                          | Pattern | Type   | Deprecated | Definition | Title/Description                              |
| ----------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------- |
| + [function](#hosting_anyOf_i0_rewrites_items_anyOf_i6_function ) | No      | string | No         | -          | -                                              |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i6_region )     | No      | string | No         | -          | -                                              |
| + [source](#hosting_anyOf_i0_rewrites_items_anyOf_i6_source )     | No      | string | No         | -          | A file path that this setting should apply to. |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i6_function"></a>9.1.11.1.7.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 6 > function`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i6_region"></a>9.1.11.1.7.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 6 > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i6_source"></a>9.1.11.1.7.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 6 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A file path that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i7"></a>9.1.11.1.8. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                          | Pattern | Type   | Deprecated | Definition | Title/Description                              |
| ----------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------- |
| + [function](#hosting_anyOf_i0_rewrites_items_anyOf_i7_function ) | No      | object | No         | -          | -                                              |
| + [source](#hosting_anyOf_i0_rewrites_items_anyOf_i7_source )     | No      | string | No         | -          | A file path that this setting should apply to. |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i7_function"></a>9.1.11.1.8.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > function`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | Yes         |
| **Additional properties** | Not allowed |

| Property                                                                       | Pattern | Type    | Deprecated | Definition | Title/Description                                                                           |
| ------------------------------------------------------------------------------ | ------- | ------- | ---------- | ---------- | ------------------------------------------------------------------------------------------- |
| + [functionId](#hosting_anyOf_i0_rewrites_items_anyOf_i7_function_functionId ) | No      | string  | No         | -          | The ID of the Cloud Function to rewrite to.                                                 |
| - [pinTag](#hosting_anyOf_i0_rewrites_items_anyOf_i7_function_pinTag )         | No      | boolean | No         | -          | If true, the rewrite will be pinned to the currently running version of the Cloud Function. |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i7_function_region )         | No      | string  | No         | -          | -                                                                                           |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i7_function_functionId"></a>9.1.11.1.8.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > function > functionId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The ID of the Cloud Function to rewrite to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i7_function_pinTag"></a>9.1.11.1.8.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > function > pinTag`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, the rewrite will be pinned to the currently running version of the Cloud Function.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i7_function_region"></a>9.1.11.1.8.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > function > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i7_source"></a>9.1.11.1.8.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 7 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A file path that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i8"></a>9.1.11.1.9. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                      | Pattern | Type   | Deprecated | Definition | Title/Description                              |
| ------------------------------------------------------------- | ------- | ------ | ---------- | ---------- | ---------------------------------------------- |
| + [run](#hosting_anyOf_i0_rewrites_items_anyOf_i8_run )       | No      | object | No         | -          | -                                              |
| + [source](#hosting_anyOf_i0_rewrites_items_anyOf_i8_source ) | No      | string | No         | -          | A file path that this setting should apply to. |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i8_run"></a>9.1.11.1.9.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > run`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | Yes         |
| **Additional properties** | Not allowed |

| Property                                                                | Pattern | Type    | Deprecated | Definition | Title/Description                                                                               |
| ----------------------------------------------------------------------- | ------- | ------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------- |
| - [pinTag](#hosting_anyOf_i0_rewrites_items_anyOf_i8_run_pinTag )       | No      | boolean | No         | -          | If true, the rewrite will be pinned to the currently running revision of the Cloud Run service. |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i8_run_region )       | No      | string  | No         | -          | -                                                                                               |
| + [serviceId](#hosting_anyOf_i0_rewrites_items_anyOf_i8_run_serviceId ) | No      | string  | No         | -          | The ID of the Cloud Run service to rewrite to.                                                  |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i8_run_pinTag"></a>9.1.11.1.9.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > run > pinTag`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, the rewrite will be pinned to the currently running revision of the Cloud Run service.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i8_run_region"></a>9.1.11.1.9.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > run > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i8_run_serviceId"></a>9.1.11.1.9.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > run > serviceId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The ID of the Cloud Run service to rewrite to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i8_source"></a>9.1.11.1.9.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 8 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A file path that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i9"></a>9.1.11.1.10. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 9`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                  | Pattern | Type    | Deprecated | Definition | Title/Description                              |
| ------------------------------------------------------------------------- | ------- | ------- | ---------- | ---------- | ---------------------------------------------- |
| + [dynamicLinks](#hosting_anyOf_i0_rewrites_items_anyOf_i9_dynamicLinks ) | No      | boolean | No         | -          | -                                              |
| + [source](#hosting_anyOf_i0_rewrites_items_anyOf_i9_source )             | No      | string  | No         | -          | A file path that this setting should apply to. |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i9_dynamicLinks"></a>9.1.11.1.10.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 9 > dynamicLinks`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | Yes       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i9_source"></a>9.1.11.1.10.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 9 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A file path that this setting should apply to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i10"></a>9.1.11.1.11. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 10`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                 | Pattern | Type   | Deprecated | Definition | Title/Description                                                           |
| ------------------------------------------------------------------------ | ------- | ------ | ---------- | ---------- | --------------------------------------------------------------------------- |
| + [destination](#hosting_anyOf_i0_rewrites_items_anyOf_i10_destination ) | No      | string | No         | -          | -                                                                           |
| + [regex](#hosting_anyOf_i0_rewrites_items_anyOf_i10_regex )             | No      | string | No         | -          | A regex pattern that matches the paths that this setting should apply to. * |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i10_destination"></a>9.1.11.1.11.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 10 > destination`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i10_regex"></a>9.1.11.1.11.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 10 > regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A regex pattern that matches the paths that this setting should apply to. *

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i11"></a>9.1.11.1.12. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 11`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                           | Pattern | Type   | Deprecated | Definition | Title/Description                                                           |
| ------------------------------------------------------------------ | ------- | ------ | ---------- | ---------- | --------------------------------------------------------------------------- |
| + [function](#hosting_anyOf_i0_rewrites_items_anyOf_i11_function ) | No      | string | No         | -          | -                                                                           |
| + [regex](#hosting_anyOf_i0_rewrites_items_anyOf_i11_regex )       | No      | string | No         | -          | A regex pattern that matches the paths that this setting should apply to. * |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i11_region )     | No      | string | No         | -          | -                                                                           |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i11_function"></a>9.1.11.1.12.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 11 > function`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i11_regex"></a>9.1.11.1.12.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 11 > regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A regex pattern that matches the paths that this setting should apply to. *

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i11_region"></a>9.1.11.1.12.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 11 > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i12"></a>9.1.11.1.13. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                           | Pattern | Type   | Deprecated | Definition | Title/Description                                                           |
| ------------------------------------------------------------------ | ------- | ------ | ---------- | ---------- | --------------------------------------------------------------------------- |
| + [function](#hosting_anyOf_i0_rewrites_items_anyOf_i12_function ) | No      | object | No         | -          | -                                                                           |
| + [regex](#hosting_anyOf_i0_rewrites_items_anyOf_i12_regex )       | No      | string | No         | -          | A regex pattern that matches the paths that this setting should apply to. * |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i12_function"></a>9.1.11.1.13.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > function`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | Yes         |
| **Additional properties** | Not allowed |

| Property                                                                        | Pattern | Type    | Deprecated | Definition | Title/Description                                                                           |
| ------------------------------------------------------------------------------- | ------- | ------- | ---------- | ---------- | ------------------------------------------------------------------------------------------- |
| + [functionId](#hosting_anyOf_i0_rewrites_items_anyOf_i12_function_functionId ) | No      | string  | No         | -          | The ID of the Cloud Function to rewrite to.                                                 |
| - [pinTag](#hosting_anyOf_i0_rewrites_items_anyOf_i12_function_pinTag )         | No      | boolean | No         | -          | If true, the rewrite will be pinned to the currently running version of the Cloud Function. |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i12_function_region )         | No      | string  | No         | -          | -                                                                                           |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i12_function_functionId"></a>9.1.11.1.13.1.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > function > functionId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The ID of the Cloud Function to rewrite to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i12_function_pinTag"></a>9.1.11.1.13.1.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > function > pinTag`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, the rewrite will be pinned to the currently running version of the Cloud Function.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i12_function_region"></a>9.1.11.1.13.1.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > function > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i12_regex"></a>9.1.11.1.13.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 12 > regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A regex pattern that matches the paths that this setting should apply to. *

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i13"></a>9.1.11.1.14. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                     | Pattern | Type   | Deprecated | Definition | Title/Description                                                           |
| ------------------------------------------------------------ | ------- | ------ | ---------- | ---------- | --------------------------------------------------------------------------- |
| + [regex](#hosting_anyOf_i0_rewrites_items_anyOf_i13_regex ) | No      | string | No         | -          | A regex pattern that matches the paths that this setting should apply to. * |
| + [run](#hosting_anyOf_i0_rewrites_items_anyOf_i13_run )     | No      | object | No         | -          | -                                                                           |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i13_regex"></a>9.1.11.1.14.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A regex pattern that matches the paths that this setting should apply to. *

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i13_run"></a>9.1.11.1.14.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > run`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | Yes         |
| **Additional properties** | Not allowed |

| Property                                                                 | Pattern | Type    | Deprecated | Definition | Title/Description                                                                               |
| ------------------------------------------------------------------------ | ------- | ------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------- |
| - [pinTag](#hosting_anyOf_i0_rewrites_items_anyOf_i13_run_pinTag )       | No      | boolean | No         | -          | If true, the rewrite will be pinned to the currently running revision of the Cloud Run service. |
| - [region](#hosting_anyOf_i0_rewrites_items_anyOf_i13_run_region )       | No      | string  | No         | -          | -                                                                                               |
| + [serviceId](#hosting_anyOf_i0_rewrites_items_anyOf_i13_run_serviceId ) | No      | string  | No         | -          | The ID of the Cloud Run service to rewrite to.                                                  |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i13_run_pinTag"></a>9.1.11.1.14.2.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > run > pinTag`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

**Description:** If true, the rewrite will be pinned to the currently running revision of the Cloud Run service.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i13_run_region"></a>9.1.11.1.14.2.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > run > region`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i13_run_serviceId"></a>9.1.11.1.14.2.3. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 13 > run > serviceId`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The ID of the Cloud Run service to rewrite to.

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i14"></a>9.1.11.1.15. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 14`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                   | Pattern | Type    | Deprecated | Definition | Title/Description                                                           |
| -------------------------------------------------------------------------- | ------- | ------- | ---------- | ---------- | --------------------------------------------------------------------------- |
| + [dynamicLinks](#hosting_anyOf_i0_rewrites_items_anyOf_i14_dynamicLinks ) | No      | boolean | No         | -          | -                                                                           |
| + [regex](#hosting_anyOf_i0_rewrites_items_anyOf_i14_regex )               | No      | string  | No         | -          | A regex pattern that matches the paths that this setting should apply to. * |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i14_dynamicLinks"></a>9.1.11.1.15.1. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 14 > dynamicLinks`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | Yes       |

###### <a name="hosting_anyOf_i0_rewrites_items_anyOf_i14_regex"></a>9.1.11.1.15.2. Property `root > hosting > anyOf > item 0 > rewrites > rewrites items > anyOf > item 14 > regex`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A regex pattern that matches the paths that this setting should apply to. *

#### <a name="hosting_anyOf_i0_site"></a>9.1.12. Property `root > hosting > anyOf > item 0 > site`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The site to deploy.

#### <a name="hosting_anyOf_i0_source"></a>9.1.13. Property `root > hosting > anyOf > item 0 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the directory containing this site's source code. This will be archived and uploaded during deployment.

#### <a name="hosting_anyOf_i0_target"></a>9.1.14. Property `root > hosting > anyOf > item 0 > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The deploy target to deploy.
See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.

#### <a name="hosting_anyOf_i0_trailingSlash"></a>9.1.15. Property `root > hosting > anyOf > item 0 > trailingSlash`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

### <a name="hosting_anyOf_i1"></a>9.2. Property `root > hosting > anyOf > item 1`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** Deployment options for a list of Firebase Hosting sites.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be         | Description |
| --------------------------------------- | ----------- |
| [item 1 items](#hosting_anyOf_i1_items) | -           |

#### <a name="hosting_anyOf_i1_items"></a>9.2.1. root > hosting > anyOf > item 1 > item 1 items

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

| Any of(Option)                             |
| ------------------------------------------ |
| [item 0](#hosting_anyOf_i1_items_anyOf_i0) |
| [item 1](#hosting_anyOf_i1_items_anyOf_i1) |

##### <a name="hosting_anyOf_i1_items_anyOf_i0"></a>9.2.1.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                   | Pattern | Type             | Deprecated | Definition                                                        | Title/Description                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------- | ---------------- | ---------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [appAssociation](#hosting_anyOf_i1_items_anyOf_i0_appAssociation )       | No      | enum (of string) | No         | -                                                                 | -                                                                                                                                                                                                         |
| - [cleanUrls](#hosting_anyOf_i1_items_anyOf_i0_cleanUrls )                 | No      | boolean          | No         | -                                                                 | -                                                                                                                                                                                                         |
| - [frameworksBackend](#hosting_anyOf_i1_items_anyOf_i0_frameworksBackend ) | No      | object           | No         | Same as [frameworksBackend](#hosting_anyOf_i0_frameworksBackend ) | Options for this sites web frameworks backend.                                                                                                                                                            |
| - [headers](#hosting_anyOf_i1_items_anyOf_i0_headers )                     | No      | array            | No         | -                                                                 | A list of extra headers to send when serving specific paths on this site.                                                                                                                                 |
| - [i18n](#hosting_anyOf_i1_items_anyOf_i0_i18n )                           | No      | object           | No         | -                                                                 | Internationalization config for this site.<br />See https://firebase.google.com/docs/hosting/i18n-rewrites#set-up-i18n-rewrites<br />for instructions on how to enable interntionalization for your site. |
| - [ignore](#hosting_anyOf_i1_items_anyOf_i0_ignore )                       | No      | array of string  | No         | -                                                                 | A list of paths or globs within the source directory that should not be included in the uploaded archive.                                                                                                 |
| - [postdeploy](#hosting_anyOf_i1_items_anyOf_i0_postdeploy )               | No      | Combination      | No         | -                                                                 | A script or list of scripts that will be ran after this product is deployed.                                                                                                                              |
| - [predeploy](#hosting_anyOf_i1_items_anyOf_i0_predeploy )                 | No      | Combination      | No         | -                                                                 | A script or list of scripts that will be ran before this product is deployed.                                                                                                                             |
| - [public](#hosting_anyOf_i1_items_anyOf_i0_public )                       | No      | string           | No         | -                                                                 | Whether this site should publically available.                                                                                                                                                            |
| - [redirects](#hosting_anyOf_i1_items_anyOf_i0_redirects )                 | No      | array            | No         | -                                                                 | A list of redirects for this site.                                                                                                                                                                        |
| - [rewrites](#hosting_anyOf_i1_items_anyOf_i0_rewrites )                   | No      | array            | No         | -                                                                 | A list o rewrites for this site.                                                                                                                                                                          |
| - [site](#hosting_anyOf_i1_items_anyOf_i0_site )                           | No      | string           | No         | -                                                                 | The site to deploy                                                                                                                                                                                        |
| - [source](#hosting_anyOf_i1_items_anyOf_i0_source )                       | No      | string           | No         | -                                                                 | Path to the directory containing this site's source code. This will be archived and uploaded during deployment.                                                                                           |
| + [target](#hosting_anyOf_i1_items_anyOf_i0_target )                       | No      | string           | No         | -                                                                 | The deploy target to deploy.<br />See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.                                                                                    |
| - [trailingSlash](#hosting_anyOf_i1_items_anyOf_i0_trailingSlash )         | No      | boolean          | No         | -                                                                 | -                                                                                                                                                                                                         |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_appAssociation"></a>9.2.1.1.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > appAssociation`

|              |                    |
| ------------ | ------------------ |
| **Type**     | `enum (of string)` |
| **Required** | No                 |

Must be one of:
* "AUTO"
* "NONE"

###### <a name="hosting_anyOf_i1_items_anyOf_i0_cleanUrls"></a>9.2.1.1.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > cleanUrls`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_frameworksBackend"></a>9.2.1.1.3. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > frameworksBackend`

|                           |                                                          |
| ------------------------- | -------------------------------------------------------- |
| **Type**                  | `object`                                                 |
| **Required**              | No                                                       |
| **Additional properties** | Not allowed                                              |
| **Same definition as**    | [frameworksBackend](#hosting_anyOf_i0_frameworksBackend) |

**Description:** Options for this sites web frameworks backend.

###### <a name="hosting_anyOf_i1_items_anyOf_i0_headers"></a>9.2.1.1.4. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > headers`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list of extra headers to send when serving specific paths on this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                  | Description                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| [HostingHeaders](#hosting_anyOf_i1_items_anyOf_i0_headers_items) | Extra headers that should be sent when serving this path. |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_headers_items"></a>9.2.1.1.4.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > headers > HostingHeaders

|                           |                                                                   |
| ------------------------- | ----------------------------------------------------------------- |
| **Type**                  | `combining`                                                       |
| **Required**              | No                                                                |
| **Additional properties** | Any type allowed                                                  |
| **Same definition as**    | [hosting_anyOf_i0_headers_items](#hosting_anyOf_i0_headers_items) |

**Description:** Extra headers that should be sent when serving this path.

###### <a name="hosting_anyOf_i1_items_anyOf_i0_i18n"></a>9.2.1.1.5. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > i18n`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Internationalization config for this site.
See https://firebase.google.com/docs/hosting/i18n-rewrites#set-up-i18n-rewrites
for instructions on how to enable interntionalization for your site.

| Property                                              | Pattern | Type   | Deprecated | Definition | Title/Description                                       |
| ----------------------------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------------------- |
| + [root](#hosting_anyOf_i1_items_anyOf_i0_i18n_root ) | No      | string | No         | -          | The directory containing internationalization rewrites. |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_i18n_root"></a>9.2.1.1.5.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > i18n > root`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The directory containing internationalization rewrites.

###### <a name="hosting_anyOf_i1_items_anyOf_i0_ignore"></a>9.2.1.1.6. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > ignore`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** A list of paths or globs within the source directory that should not be included in the uploaded archive.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                               | Description |
| ------------------------------------------------------------- | ----------- |
| [ignore items](#hosting_anyOf_i1_items_anyOf_i0_ignore_items) | -           |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_ignore_items"></a>9.2.1.1.6.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > ignore > ignore items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_postdeploy"></a>9.2.1.1.7. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                                 |
| -------------------------------------------------------------- |
| [item 0](#hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1) |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0"></a>9.2.1.1.7.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                            | Description |
| -------------------------------------------------------------------------- | ----------- |
| [item 0 items](#hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i0_items"></a>9.2.1.1.7.1.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_postdeploy_anyOf_i1"></a>9.2.1.1.7.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_predeploy"></a>9.2.1.1.8. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                                |
| ------------------------------------------------------------- |
| [item 0](#hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1) |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0"></a>9.2.1.1.8.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                           | Description |
| ------------------------------------------------------------------------- | ----------- |
| [item 0 items](#hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i0_items"></a>9.2.1.1.8.1.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_predeploy_anyOf_i1"></a>9.2.1.1.8.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_public"></a>9.2.1.1.9. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > public`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Whether this site should publically available.

###### <a name="hosting_anyOf_i1_items_anyOf_i0_redirects"></a>9.2.1.1.10. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > redirects`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list of redirects for this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                      | Description                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [HostingRedirects](#hosting_anyOf_i1_items_anyOf_i0_redirects_items) | URL redirects for a hosting site. Use these to prevent broken links when moving pages. |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_redirects_items"></a>9.2.1.1.10.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > redirects > HostingRedirects

|                           |                                                                       |
| ------------------------- | --------------------------------------------------------------------- |
| **Type**                  | `combining`                                                           |
| **Required**              | No                                                                    |
| **Additional properties** | Any type allowed                                                      |
| **Same definition as**    | [hosting_anyOf_i0_redirects_items](#hosting_anyOf_i0_redirects_items) |

**Description:** URL redirects for a hosting site. Use these to prevent broken links when moving pages.

###### <a name="hosting_anyOf_i1_items_anyOf_i0_rewrites"></a>9.2.1.1.11. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > rewrites`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list o rewrites for this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                    | Description                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [HostingRewrites](#hosting_anyOf_i1_items_anyOf_i0_rewrites_items) | Defines a Hosting rewrite. Rewrites allow you to redirect URLs to a different path, Cloud function or Cloud Run service. |

###### <a name="hosting_anyOf_i1_items_anyOf_i0_rewrites_items"></a>9.2.1.1.11.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > rewrites > HostingRewrites

|                           |                                                                     |
| ------------------------- | ------------------------------------------------------------------- |
| **Type**                  | `combining`                                                         |
| **Required**              | No                                                                  |
| **Additional properties** | Any type allowed                                                    |
| **Same definition as**    | [hosting_anyOf_i0_rewrites_items](#hosting_anyOf_i0_rewrites_items) |

**Description:** Defines a Hosting rewrite. Rewrites allow you to redirect URLs to a different path, Cloud function or Cloud Run service.

###### <a name="hosting_anyOf_i1_items_anyOf_i0_site"></a>9.2.1.1.12. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > site`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The site to deploy

###### <a name="hosting_anyOf_i1_items_anyOf_i0_source"></a>9.2.1.1.13. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the directory containing this site's source code. This will be archived and uploaded during deployment.

###### <a name="hosting_anyOf_i1_items_anyOf_i0_target"></a>9.2.1.1.14. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The deploy target to deploy.
See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.

###### <a name="hosting_anyOf_i1_items_anyOf_i0_trailingSlash"></a>9.2.1.1.15. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 0 > trailingSlash`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

##### <a name="hosting_anyOf_i1_items_anyOf_i1"></a>9.2.1.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                                                   | Pattern | Type             | Deprecated | Definition                                                        | Title/Description                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------- | ---------------- | ---------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| - [appAssociation](#hosting_anyOf_i1_items_anyOf_i1_appAssociation )       | No      | enum (of string) | No         | -                                                                 | -                                                                                                                                                                                                         |
| - [cleanUrls](#hosting_anyOf_i1_items_anyOf_i1_cleanUrls )                 | No      | boolean          | No         | -                                                                 | -                                                                                                                                                                                                         |
| - [frameworksBackend](#hosting_anyOf_i1_items_anyOf_i1_frameworksBackend ) | No      | object           | No         | Same as [frameworksBackend](#hosting_anyOf_i0_frameworksBackend ) | Options for this sites web frameworks backend.                                                                                                                                                            |
| - [headers](#hosting_anyOf_i1_items_anyOf_i1_headers )                     | No      | array            | No         | -                                                                 | A list of extra headers to send when serving specific paths on this site.                                                                                                                                 |
| - [i18n](#hosting_anyOf_i1_items_anyOf_i1_i18n )                           | No      | object           | No         | -                                                                 | Internationalization config for this site.<br />See https://firebase.google.com/docs/hosting/i18n-rewrites#set-up-i18n-rewrites<br />for instructions on how to enable interntionalization for your site. |
| - [ignore](#hosting_anyOf_i1_items_anyOf_i1_ignore )                       | No      | array of string  | No         | -                                                                 | A list of paths or globs within the source directory that should not be included in the uploaded archive.                                                                                                 |
| - [postdeploy](#hosting_anyOf_i1_items_anyOf_i1_postdeploy )               | No      | Combination      | No         | -                                                                 | A script or list of scripts that will be ran after this product is deployed.                                                                                                                              |
| - [predeploy](#hosting_anyOf_i1_items_anyOf_i1_predeploy )                 | No      | Combination      | No         | -                                                                 | A script or list of scripts that will be ran before this product is deployed.                                                                                                                             |
| - [public](#hosting_anyOf_i1_items_anyOf_i1_public )                       | No      | string           | No         | -                                                                 | Whether this site should publically available.                                                                                                                                                            |
| - [redirects](#hosting_anyOf_i1_items_anyOf_i1_redirects )                 | No      | array            | No         | -                                                                 | A list of redirects for this site.                                                                                                                                                                        |
| - [rewrites](#hosting_anyOf_i1_items_anyOf_i1_rewrites )                   | No      | array            | No         | -                                                                 | A list o rewrites for this site.                                                                                                                                                                          |
| + [site](#hosting_anyOf_i1_items_anyOf_i1_site )                           | No      | string           | No         | -                                                                 | The site to deploy                                                                                                                                                                                        |
| - [source](#hosting_anyOf_i1_items_anyOf_i1_source )                       | No      | string           | No         | -                                                                 | Path to the directory containing this site's source code. This will be archived and uploaded during deployment.                                                                                           |
| - [target](#hosting_anyOf_i1_items_anyOf_i1_target )                       | No      | string           | No         | -                                                                 | The deploy target to deploy.<br />See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.                                                                                    |
| - [trailingSlash](#hosting_anyOf_i1_items_anyOf_i1_trailingSlash )         | No      | boolean          | No         | -                                                                 | -                                                                                                                                                                                                         |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_appAssociation"></a>9.2.1.2.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > appAssociation`

|              |                    |
| ------------ | ------------------ |
| **Type**     | `enum (of string)` |
| **Required** | No                 |

Must be one of:
* "AUTO"
* "NONE"

###### <a name="hosting_anyOf_i1_items_anyOf_i1_cleanUrls"></a>9.2.1.2.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > cleanUrls`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_frameworksBackend"></a>9.2.1.2.3. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > frameworksBackend`

|                           |                                                          |
| ------------------------- | -------------------------------------------------------- |
| **Type**                  | `object`                                                 |
| **Required**              | No                                                       |
| **Additional properties** | Not allowed                                              |
| **Same definition as**    | [frameworksBackend](#hosting_anyOf_i0_frameworksBackend) |

**Description:** Options for this sites web frameworks backend.

###### <a name="hosting_anyOf_i1_items_anyOf_i1_headers"></a>9.2.1.2.4. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > headers`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list of extra headers to send when serving specific paths on this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                  | Description                                               |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| [HostingHeaders](#hosting_anyOf_i1_items_anyOf_i1_headers_items) | Extra headers that should be sent when serving this path. |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_headers_items"></a>9.2.1.2.4.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > headers > HostingHeaders

|                           |                                                                   |
| ------------------------- | ----------------------------------------------------------------- |
| **Type**                  | `combining`                                                       |
| **Required**              | No                                                                |
| **Additional properties** | Any type allowed                                                  |
| **Same definition as**    | [hosting_anyOf_i0_headers_items](#hosting_anyOf_i0_headers_items) |

**Description:** Extra headers that should be sent when serving this path.

###### <a name="hosting_anyOf_i1_items_anyOf_i1_i18n"></a>9.2.1.2.5. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > i18n`

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

**Description:** Internationalization config for this site.
See https://firebase.google.com/docs/hosting/i18n-rewrites#set-up-i18n-rewrites
for instructions on how to enable interntionalization for your site.

| Property                                              | Pattern | Type   | Deprecated | Definition | Title/Description                                       |
| ----------------------------------------------------- | ------- | ------ | ---------- | ---------- | ------------------------------------------------------- |
| + [root](#hosting_anyOf_i1_items_anyOf_i1_i18n_root ) | No      | string | No         | -          | The directory containing internationalization rewrites. |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_i18n_root"></a>9.2.1.2.5.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > i18n > root`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The directory containing internationalization rewrites.

###### <a name="hosting_anyOf_i1_items_anyOf_i1_ignore"></a>9.2.1.2.6. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > ignore`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

**Description:** A list of paths or globs within the source directory that should not be included in the uploaded archive.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                               | Description |
| ------------------------------------------------------------- | ----------- |
| [ignore items](#hosting_anyOf_i1_items_anyOf_i1_ignore_items) | -           |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_ignore_items"></a>9.2.1.2.6.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > ignore > ignore items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_postdeploy"></a>9.2.1.2.7. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                                 |
| -------------------------------------------------------------- |
| [item 0](#hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0) |
| [item 1](#hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1) |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0"></a>9.2.1.2.7.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                            | Description |
| -------------------------------------------------------------------------- | ----------- |
| [item 0 items](#hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items) | -           |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i0_items"></a>9.2.1.2.7.1.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_postdeploy_anyOf_i1"></a>9.2.1.2.7.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_predeploy"></a>9.2.1.2.8. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                                |
| ------------------------------------------------------------- |
| [item 0](#hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0) |
| [item 1](#hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1) |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0"></a>9.2.1.2.8.1. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                           | Description |
| ------------------------------------------------------------------------- | ----------- |
| [item 0 items](#hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items) | -           |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i0_items"></a>9.2.1.2.8.1.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_predeploy_anyOf_i1"></a>9.2.1.2.8.2. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_public"></a>9.2.1.2.9. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > public`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Whether this site should publically available.

###### <a name="hosting_anyOf_i1_items_anyOf_i1_redirects"></a>9.2.1.2.10. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > redirects`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list of redirects for this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                      | Description                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [HostingRedirects](#hosting_anyOf_i1_items_anyOf_i1_redirects_items) | URL redirects for a hosting site. Use these to prevent broken links when moving pages. |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_redirects_items"></a>9.2.1.2.10.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > redirects > HostingRedirects

|                           |                                                                       |
| ------------------------- | --------------------------------------------------------------------- |
| **Type**                  | `combining`                                                           |
| **Required**              | No                                                                    |
| **Additional properties** | Any type allowed                                                      |
| **Same definition as**    | [hosting_anyOf_i0_redirects_items](#hosting_anyOf_i0_redirects_items) |

**Description:** URL redirects for a hosting site. Use these to prevent broken links when moving pages.

###### <a name="hosting_anyOf_i1_items_anyOf_i1_rewrites"></a>9.2.1.2.11. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > rewrites`

|              |         |
| ------------ | ------- |
| **Type**     | `array` |
| **Required** | No      |

**Description:** A list o rewrites for this site.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                    | Description                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| [HostingRewrites](#hosting_anyOf_i1_items_anyOf_i1_rewrites_items) | Defines a Hosting rewrite. Rewrites allow you to redirect URLs to a different path, Cloud function or Cloud Run service. |

###### <a name="hosting_anyOf_i1_items_anyOf_i1_rewrites_items"></a>9.2.1.2.11.1. root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > rewrites > HostingRewrites

|                           |                                                                     |
| ------------------------- | ------------------------------------------------------------------- |
| **Type**                  | `combining`                                                         |
| **Required**              | No                                                                  |
| **Additional properties** | Any type allowed                                                    |
| **Same definition as**    | [hosting_anyOf_i0_rewrites_items](#hosting_anyOf_i0_rewrites_items) |

**Description:** Defines a Hosting rewrite. Rewrites allow you to redirect URLs to a different path, Cloud function or Cloud Run service.

###### <a name="hosting_anyOf_i1_items_anyOf_i1_site"></a>9.2.1.2.12. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > site`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The site to deploy

###### <a name="hosting_anyOf_i1_items_anyOf_i1_source"></a>9.2.1.2.13. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > source`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** Path to the directory containing this site's source code. This will be archived and uploaded during deployment.

###### <a name="hosting_anyOf_i1_items_anyOf_i1_target"></a>9.2.1.2.14. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The deploy target to deploy.
See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.

###### <a name="hosting_anyOf_i1_items_anyOf_i1_trailingSlash"></a>9.2.1.2.15. Property `root > hosting > anyOf > item 1 > item 1 items > anyOf > item 1 > trailingSlash`

|              |           |
| ------------ | --------- |
| **Type**     | `boolean` |
| **Required** | No        |

## <a name="remoteconfig"></a>10. Property `root > remoteconfig`

|                           |                                  |
| ------------------------- | -------------------------------- |
| **Type**                  | `object`                         |
| **Required**              | No                               |
| **Additional properties** | Not allowed                      |
| **Defined in**            | #/definitions/RemoteConfigConfig |

**Description:** The Remote Config template(s) used by this project.

| Property                                  | Pattern | Type        | Deprecated | Definition | Title/Description                                                             |
| ----------------------------------------- | ------- | ----------- | ---------- | ---------- | ----------------------------------------------------------------------------- |
| - [postdeploy](#remoteconfig_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.  |
| - [predeploy](#remoteconfig_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed. |
| + [template](#remoteconfig_template )     | No      | string      | No         | -          | A path to a CJSON file containing a Remote Config template.                   |

### <a name="remoteconfig_postdeploy"></a>10.1. Property `root > remoteconfig > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                              |
| ------------------------------------------- |
| [item 0](#remoteconfig_postdeploy_anyOf_i0) |
| [item 1](#remoteconfig_postdeploy_anyOf_i1) |

#### <a name="remoteconfig_postdeploy_anyOf_i0"></a>10.1.1. Property `root > remoteconfig > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                         | Description |
| ------------------------------------------------------- | ----------- |
| [item 0 items](#remoteconfig_postdeploy_anyOf_i0_items) | -           |

##### <a name="remoteconfig_postdeploy_anyOf_i0_items"></a>10.1.1.1. root > remoteconfig > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="remoteconfig_postdeploy_anyOf_i1"></a>10.1.2. Property `root > remoteconfig > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

### <a name="remoteconfig_predeploy"></a>10.2. Property `root > remoteconfig > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                             |
| ------------------------------------------ |
| [item 0](#remoteconfig_predeploy_anyOf_i0) |
| [item 1](#remoteconfig_predeploy_anyOf_i1) |

#### <a name="remoteconfig_predeploy_anyOf_i0"></a>10.2.1. Property `root > remoteconfig > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                        | Description |
| ------------------------------------------------------ | ----------- |
| [item 0 items](#remoteconfig_predeploy_anyOf_i0_items) | -           |

##### <a name="remoteconfig_predeploy_anyOf_i0_items"></a>10.2.1.1. root > remoteconfig > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="remoteconfig_predeploy_anyOf_i1"></a>10.2.2. Property `root > remoteconfig > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

### <a name="remoteconfig_template"></a>10.3. Property `root > remoteconfig > template`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** A path to a CJSON file containing a Remote Config template.

## <a name="storage"></a>11. Property `root > storage`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** The Firebase Storage rules that should be deployed or emulated.

| Any of(Option)                     |
| ---------------------------------- |
| [StorageSingle](#storage_anyOf_i0) |
| [item 1](#storage_anyOf_i1)        |

### <a name="storage_anyOf_i0"></a>11.1. Property `root > storage > anyOf > StorageSingle`

|                           |                             |
| ------------------------- | --------------------------- |
| **Type**                  | `object`                    |
| **Required**              | No                          |
| **Additional properties** | Not allowed                 |
| **Defined in**            | #/definitions/StorageSingle |

**Description:** Deployment options for a single Firebase storage bucket.

| Property                                      | Pattern | Type        | Deprecated | Definition | Title/Description                                                                                                                      |
| --------------------------------------------- | ------- | ----------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| - [postdeploy](#storage_anyOf_i0_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.                                                           |
| - [predeploy](#storage_anyOf_i0_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed.                                                          |
| + [rules](#storage_anyOf_i0_rules )           | No      | string      | No         | -          | Path to the rules files for this Firebase Storage bucket.                                                                              |
| - [target](#storage_anyOf_i0_target )         | No      | string      | No         | -          | The deploy target to these Storage rules to.<br />See https://firebase.google.com/docs/cli/targets to learn more about deploy targets. |

#### <a name="storage_anyOf_i0_postdeploy"></a>11.1.1. Property `root > storage > anyOf > item 0 > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                  |
| ----------------------------------------------- |
| [item 0](#storage_anyOf_i0_postdeploy_anyOf_i0) |
| [item 1](#storage_anyOf_i0_postdeploy_anyOf_i1) |

##### <a name="storage_anyOf_i0_postdeploy_anyOf_i0"></a>11.1.1.1. Property `root > storage > anyOf > item 0 > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                             | Description |
| ----------------------------------------------------------- | ----------- |
| [item 0 items](#storage_anyOf_i0_postdeploy_anyOf_i0_items) | -           |

###### <a name="storage_anyOf_i0_postdeploy_anyOf_i0_items"></a>11.1.1.1.1. root > storage > anyOf > item 0 > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="storage_anyOf_i0_postdeploy_anyOf_i1"></a>11.1.1.2. Property `root > storage > anyOf > item 0 > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="storage_anyOf_i0_predeploy"></a>11.1.2. Property `root > storage > anyOf > item 0 > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                 |
| ---------------------------------------------- |
| [item 0](#storage_anyOf_i0_predeploy_anyOf_i0) |
| [item 1](#storage_anyOf_i0_predeploy_anyOf_i1) |

##### <a name="storage_anyOf_i0_predeploy_anyOf_i0"></a>11.1.2.1. Property `root > storage > anyOf > item 0 > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                            | Description |
| ---------------------------------------------------------- | ----------- |
| [item 0 items](#storage_anyOf_i0_predeploy_anyOf_i0_items) | -           |

###### <a name="storage_anyOf_i0_predeploy_anyOf_i0_items"></a>11.1.2.1.1. root > storage > anyOf > item 0 > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="storage_anyOf_i0_predeploy_anyOf_i1"></a>11.1.2.2. Property `root > storage > anyOf > item 0 > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

#### <a name="storage_anyOf_i0_rules"></a>11.1.3. Property `root > storage > anyOf > item 0 > rules`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** Path to the rules files for this Firebase Storage bucket.

#### <a name="storage_anyOf_i0_target"></a>11.1.4. Property `root > storage > anyOf > item 0 > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The deploy target to these Storage rules to.
See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.

### <a name="storage_anyOf_i1"></a>11.2. Property `root > storage > anyOf > item 1`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of object` |
| **Required** | No                |

**Description:** Deployment options for multiple Firebase storage buckets.

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be         | Description |
| --------------------------------------- | ----------- |
| [item 1 items](#storage_anyOf_i1_items) | -           |

#### <a name="storage_anyOf_i1_items"></a>11.2.1. root > storage > anyOf > item 1 > item 1 items

|                           |             |
| ------------------------- | ----------- |
| **Type**                  | `object`    |
| **Required**              | No          |
| **Additional properties** | Not allowed |

| Property                                            | Pattern | Type        | Deprecated | Definition | Title/Description                                                                                                                      |
| --------------------------------------------------- | ------- | ----------- | ---------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| + [bucket](#storage_anyOf_i1_items_bucket )         | No      | string      | No         | -          | The Firebase Storage bucket that this config is for.                                                                                   |
| - [postdeploy](#storage_anyOf_i1_items_postdeploy ) | No      | Combination | No         | -          | A script or list of scripts that will be ran after this product is deployed.                                                           |
| - [predeploy](#storage_anyOf_i1_items_predeploy )   | No      | Combination | No         | -          | A script or list of scripts that will be ran before this product is deployed.                                                          |
| + [rules](#storage_anyOf_i1_items_rules )           | No      | string      | No         | -          | Path to the rules files for this Firebase Storage bucket.                                                                              |
| - [target](#storage_anyOf_i1_items_target )         | No      | string      | No         | -          | The deploy target to these Storage rules to.<br />See https://firebase.google.com/docs/cli/targets to learn more about deploy targets. |

##### <a name="storage_anyOf_i1_items_bucket"></a>11.2.1.1. Property `root > storage > anyOf > item 1 > item 1 items > bucket`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** The Firebase Storage bucket that this config is for.

##### <a name="storage_anyOf_i1_items_postdeploy"></a>11.2.1.2. Property `root > storage > anyOf > item 1 > item 1 items > postdeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran after this product is deployed.

| Any of(Option)                                        |
| ----------------------------------------------------- |
| [item 0](#storage_anyOf_i1_items_postdeploy_anyOf_i0) |
| [item 1](#storage_anyOf_i1_items_postdeploy_anyOf_i1) |

###### <a name="storage_anyOf_i1_items_postdeploy_anyOf_i0"></a>11.2.1.2.1. Property `root > storage > anyOf > item 1 > item 1 items > postdeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                   | Description |
| ----------------------------------------------------------------- | ----------- |
| [item 0 items](#storage_anyOf_i1_items_postdeploy_anyOf_i0_items) | -           |

###### <a name="storage_anyOf_i1_items_postdeploy_anyOf_i0_items"></a>11.2.1.2.1.1. root > storage > anyOf > item 1 > item 1 items > postdeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="storage_anyOf_i1_items_postdeploy_anyOf_i1"></a>11.2.1.2.2. Property `root > storage > anyOf > item 1 > item 1 items > postdeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="storage_anyOf_i1_items_predeploy"></a>11.2.1.3. Property `root > storage > anyOf > item 1 > item 1 items > predeploy`

|                           |                  |
| ------------------------- | ---------------- |
| **Type**                  | `combining`      |
| **Required**              | No               |
| **Additional properties** | Any type allowed |

**Description:** A script or list of scripts that will be ran before this product is deployed.

| Any of(Option)                                       |
| ---------------------------------------------------- |
| [item 0](#storage_anyOf_i1_items_predeploy_anyOf_i0) |
| [item 1](#storage_anyOf_i1_items_predeploy_anyOf_i1) |

###### <a name="storage_anyOf_i1_items_predeploy_anyOf_i0"></a>11.2.1.3.1. Property `root > storage > anyOf > item 1 > item 1 items > predeploy > anyOf > item 0`

|              |                   |
| ------------ | ----------------- |
| **Type**     | `array of string` |
| **Required** | No                |

|                      | Array restrictions |
| -------------------- | ------------------ |
| **Min items**        | N/A                |
| **Max items**        | N/A                |
| **Items unicity**    | False              |
| **Additional items** | False              |
| **Tuple validation** | See below          |

| Each item of this array must be                                  | Description |
| ---------------------------------------------------------------- | ----------- |
| [item 0 items](#storage_anyOf_i1_items_predeploy_anyOf_i0_items) | -           |

###### <a name="storage_anyOf_i1_items_predeploy_anyOf_i0_items"></a>11.2.1.3.1.1. root > storage > anyOf > item 1 > item 1 items > predeploy > anyOf > item 0 > item 0 items

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

###### <a name="storage_anyOf_i1_items_predeploy_anyOf_i1"></a>11.2.1.3.2. Property `root > storage > anyOf > item 1 > item 1 items > predeploy > anyOf > item 1`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

##### <a name="storage_anyOf_i1_items_rules"></a>11.2.1.4. Property `root > storage > anyOf > item 1 > item 1 items > rules`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | Yes      |

**Description:** Path to the rules files for this Firebase Storage bucket.

##### <a name="storage_anyOf_i1_items_target"></a>11.2.1.5. Property `root > storage > anyOf > item 1 > item 1 items > target`

|              |          |
| ------------ | -------- |
| **Type**     | `string` |
| **Required** | No       |

**Description:** The deploy target to these Storage rules to.
See https://firebase.google.com/docs/cli/targets to learn more about deploy targets.

----------------------------------------------------------------------------------------------------------------------------
Generated using [json-schema-for-humans](https://github.com/coveooss/json-schema-for-humans) on 2025-06-17 at 07:03:18 -0700
