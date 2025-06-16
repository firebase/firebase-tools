

# 



<table>
<tbody>
<tr><th>$id</th><td>connector.yaml</td></tr>
<tr><th>$schema</th><td>http://json-schema.org/draft-07/schema#</td></tr>
</tbody>
</table>

## Properties

<table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td colspan="2"><a href="#connectorid">connectorId</a></td><td>String</td></tr><tr><td colspan="2"><a href="#generate">generate</a></td><td>Object</td></tr></tbody></table>



<hr />


## connectorId


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The ID of the Firebase Data Connect connector.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## generate


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
  <table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td rowspan="2">javascriptSdk</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td rowspan="2">dartSdk</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td rowspan="2">kotlinSdk</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td rowspan="2">swiftSdk</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td rowspan="2">llmTools</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr></tbody></table>


### generate.javascriptSdk


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Configuration for a generated Javascript SDK</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### generate.javascriptSdk.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### generate.javascriptSdk.0.outputDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the directory where generated files should be written to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### generate.javascriptSdk.0.package


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The package name to use for the generated code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### generate.javascriptSdk.0.packageJSONDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The directory containining the package.json to install the generated package in.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### generate.javascriptSdk.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### generate.javascriptSdk.1.outputDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the directory where generated files should be written to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### generate.javascriptSdk.1.package


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The package name to use for the generated code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### generate.javascriptSdk.1.packageJSONDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The directory containining the package.json to install the generated package in.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






### generate.dartSdk


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Configuration for a generated Dart SDK</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### generate.dartSdk.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### generate.dartSdk.0.outputDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the directory where generated files should be written to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### generate.dartSdk.0.package


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The package name to use for the generated code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### generate.dartSdk.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### generate.dartSdk.1.outputDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the directory where generated files should be written to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### generate.dartSdk.1.package


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The package name to use for the generated code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






### generate.kotlinSdk


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Configuration for a generated Kotlin SDK</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### generate.kotlinSdk.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### generate.kotlinSdk.0.outputDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the directory where generated files should be written to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### generate.kotlinSdk.0.package


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The package name to use for the generated code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### generate.kotlinSdk.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### generate.kotlinSdk.1.outputDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the directory where generated files should be written to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### generate.kotlinSdk.1.package


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The package name to use for the generated code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






### generate.swiftSdk


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Configuration for a generated Swift SDK</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### generate.swiftSdk.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### generate.swiftSdk.0.outputDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the directory where generated files should be written to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### generate.swiftSdk.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### generate.swiftSdk.1.outputDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the directory where generated files should be written to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






### generate.llmTools


<table class="jssd-property-table">
  <tbody>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">One of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### generate.llmTools.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### generate.llmTools.0.outputFile


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path where the JSON LLM tool definitions file should be generated.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### generate.llmTools.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### generate.llmTools.1.outputFile


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path where the JSON LLM tool definitions file should be generated.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>












<hr />

## Schema
```
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "connector.yaml",
    "additionalProperties": false,
    "definitions": {
        "javascriptSdk": {
            "additionalProperties": true,
            "type": "object",
            "properties": {
                "outputDir": {
                    "type": "string",
                    "description": "Path to the directory where generated files should be written to."
                },
                "package": {
                    "type": "string",
                    "description": "The package name to use for the generated code."
                },
                "packageJSONDir": {
                    "type": "string",
                    "description": "The directory containining the package.json to install the generated package in."
                }
            }
        },
        "dartSdk": {
            "additionalProperties": true,
            "type": "object",
            "properties": {
                "outputDir": {
                    "type": "string",
                    "description": "Path to the directory where generated files should be written to."
                },
                "package": {
                    "type": "string",
                    "description": "The package name to use for the generated code."
                }
            }
        },
        "kotlinSdk": {
            "additionalProperties": true,
            "type": "object",
            "properties": {
                "outputDir": {
                    "type": "string",
                    "description": "Path to the directory where generated files should be written to."
                },
                "package": {
                    "type": "string",
                    "description": "The package name to use for the generated code."
                }
            }
        },
        "swiftSdk": {
            "additionalProperties": true,
            "type": "object",
            "properties": {
                "outputDir": {
                    "type": "string",
                    "description": "Path to the directory where generated files should be written to."
                }
            }
        },
        "llmTools": {
            "additionalProperties": true,
            "type": "object",
            "properties": {
                "outputFile": {
                    "type": "string",
                    "description": "Path where the JSON LLM tool definitions file should be generated."
                }
            }
        }
    },
    "properties": {
        "connectorId": {
            "type": "string",
            "description": "The ID of the Firebase Data Connect connector."
        },
        "generate": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "javascriptSdk": {
                    "oneOf": [
                        {
                            "$ref": "#/definitions/javascriptSdk"
                        },
                        {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/javascriptSdk"
                            }
                        }
                    ],
                    "description": "Configuration for a generated Javascript SDK"
                },
                "dartSdk": {
                    "oneOf": [
                        {
                            "$ref": "#/definitions/dartSdk"
                        },
                        {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/dartSdk"
                            }
                        }
                    ],
                    "description": "Configuration for a generated Dart SDK"
                },
                "kotlinSdk": {
                    "oneOf": [
                        {
                            "$ref": "#/definitions/kotlinSdk"
                        },
                        {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/kotlinSdk"
                            }
                        }
                    ],
                    "description": "Configuration for a generated Kotlin SDK"
                },
                "swiftSdk": {
                    "oneOf": [
                        {
                            "$ref": "#/definitions/swiftSdk"
                        },
                        {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/swiftSdk"
                            }
                        }
                    ],
                    "description": "Configuration for a generated Swift SDK"
                },
                "llmTools": {
                    "oneOf": [
                        {
                            "$ref": "#/definitions/llmTools"
                        },
                        {
                            "type": "array",
                            "items": {
                                "$ref": "#/definitions/llmTools"
                            }
                        }
                    ]
                }
            }
        }
    }
}
```


