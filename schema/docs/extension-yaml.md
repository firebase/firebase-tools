

# 



<table>
<tbody>
<tr><th>$id</th><td>extension.yaml</td></tr>
<tr><th>$schema</th><td>http://json-schema.org/draft-07/schema#</td></tr>
</tbody>
</table>

## Properties

<table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td colspan="2"><a href="#name">name</a></td><td>String</td></tr><tr><td colspan="2"><a href="#version">version</a></td><td>String</td></tr><tr><td colspan="2"><a href="#specversion">specVersion</a></td><td>String</td></tr><tr><td colspan="2"><a href="#license">license</a></td><td>String</td></tr><tr><td colspan="2"><a href="#displayname">displayName</a></td><td>String</td></tr><tr><td colspan="2"><a href="#description">description</a></td><td>String</td></tr><tr><td colspan="2"><a href="#icon">icon</a></td><td>String</td></tr><tr><td colspan="2"><a href="#billingrequired">billingRequired</a></td><td>Boolean</td></tr><tr><td colspan="2"><a href="#tags">tags</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#sourceurl">sourceUrl</a></td><td>String</td></tr><tr><td colspan="2"><a href="#releasenotesurl">releaseNotesUrl</a></td><td>String</td></tr><tr><td colspan="2"><a href="#author">author</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#contributors">contributors</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#apis">apis</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#roles">roles</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#externalservices">externalServices</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#params">params</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#resources">resources</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#lifecycleevents">lifecycleEvents</a></td><td>Array</td></tr><tr><td colspan="2"><a href="#events">events</a></td><td>Array</td></tr></tbody></table>



<hr />


## name


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">ID of this extension (ie your-extension-name)</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## version


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Version of this extension. Follows https://semver.org/.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## specVersion


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Version of the extension.yaml spec that this file follows. Currently always &#x27;v1beta&#x27;</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## license


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The software license agreement for this extension. Currently, only &#x27;Apache-2.0&#x27; is permitted on extensions.dev</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## displayName


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Human readable name for this extension (ie &#x27;Your Extension Name&#x27;)</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## description


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A one to two sentence description of what this extension does</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## icon


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The file name of this extension&#x27;s icon</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## billingRequired


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Whether this extension requires a billing to be enabled on the project it is installed on</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## tags


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A list of tags to help users find your extension in search</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## sourceUrl


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The URL of the GitHub repo hosting this code</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## releaseNotesUrl


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A URL where users can view the full changelog or release notes for this extension</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## author


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
  <table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td colspan="2"><a href="#authorauthorname">authorName</a></td><td>String</td></tr><tr><td colspan="2"><a href="#authoremail">email</a></td><td>String</td></tr><tr><td colspan="2"><a href="#authorurl">url</a></td><td>String</td></tr></tbody></table>


### author.authorName


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The author&#x27;s name</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### author.email


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A contact email for the author</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### author.url


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">URL of the author&#x27;s website</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





## contributors


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## apis


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### apis.apiName


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Name of the Google API to enable. Should match the service name listed in https://console.cloud.google.com/apis/library</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Pattern</th>
      <td colspan="2">[^\.]+\.googleapis\.com</td>
    </tr>
  </tbody>
</table>




### apis.reason


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Why this extension needs this API enabled</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





## roles


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### roles.role


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Name of the IAM role to grant. Must be on the list of allowed roles: https://firebase.google.com/docs/extensions/publishers/access#supported-roles</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Pattern</th>
      <td colspan="2">[a-zA-Z]+\.[a-zA-Z]+</td>
    </tr>
  </tbody>
</table>




### roles.reason


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Why this extension needs this IAM role</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### roles.resource


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">What resource to grant this role on. If omitted, defaults to projects/${project_id}</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





## externalServices


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### externalServices.name


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Name of the external service</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### externalServices.pricingUri


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">URI to pricing information for the service</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





## params


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### params.param


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The name of the param. This is how you reference the param in your code</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### params.label


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Short description for the parameter. Displayed to users when they&#x27;re prompted for the parameter&#x27;s value.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### params.description


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Detailed description for the parameter. Displayed to users when they&#x27;re prompted for the parameter&#x27;s value.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### params.example


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Example value for the parameter.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### params.validationRegex


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Regular expression for validation of the parameter&#x27;s user-configured value. Uses Google RE2 syntax.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### params.validationErrorMessage


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Error message to display if regex validation fails.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### params.default


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Default value for the parameter if the user leaves the parameter&#x27;s value blank.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### params.required


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Defines whether the user can submit an empty string when they&#x27;re prompted for the parameter&#x27;s value. Defaults to true.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### params.immutable


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Defines whether the user can change the parameter&#x27;s value after installation (such as if they reconfigure the extension). Defaults to false.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### params.advanced


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Whether this a param for advanced users. When true, only users who choose &#x27;advanced configuration&#x27; will see this param.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### params.type


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The parameter type. Special parameter types might have additional requirements or different UI presentation. See https://firebase.google.com/docs/extensions/reference/extension-yaml#params for more details.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Pattern</th>
      <td colspan="2">string|select|multiSelect|secret|selectResource</td>
    </tr>
  </tbody>
</table>




### params.resourceType


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The type of resource to prompt the user to select. Provides a special UI treatment for the param.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Pattern</th>
      <td colspan="2">storage\.googleapis\.com\/Bucket|firestore\.googleapis\.com\/Database|firebasedatabase\.googleapis\.com\/DatabaseInstance</td>
    </tr>
  </tbody>
</table>




### params.options


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Options for a select or multiSelect type param.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### params.options.value


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">One of the values the user can choose. This is the value you get when you read the parameter value in code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### params.options.label


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Short description of the selectable option. If omitted, defaults to value.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






## resources


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### resources.name


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The name of this resource</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.type


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">What type of resource this is. See https://firebase.google.com/docs/extensions/reference/extension-yaml#resources for a full list of options.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.description


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A brief description of what this resource does</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The properties of this resource</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### resources.properties.location


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The location for this resource</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.entryPoint


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The entry point for a function resource</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.sourceDirectory


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Directory that contains your package.json at its root. The file for your functions source code must be in this directory. Defaults to functions</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.timeout


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A function resources&#x27;s maximum execution time.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Pattern</th>
      <td colspan="2">\d+s</td>
    </tr>
  </tbody>
</table>




### resources.properties.availableMemoryMb


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Amount of memory in MB available for the function.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Pattern</th>
      <td colspan="2">\d+</td>
    </tr>
  </tbody>
</table>




### resources.properties.runtime


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Runtime environment for the function. Defaults to the most recent LTS version of node.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.httpsTrigger


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A function triggered by HTTPS calls</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>




### resources.properties.eventTrigger


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A function triggered by a background event</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### resources.properties.eventTrigger.eventType


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The type of background event to trigger on. See https://firebase.google.com/docs/extensions/publishers/functions#supported for a full list.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.eventTrigger.resource


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The name or pattern of the resource to trigger on</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.eventTrigger.eventFilters


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Filters that further limit the events to listen to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### resources.properties.eventTrigger.eventFilters.attribute


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The event attribute to filter on</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.eventTrigger.eventFilters.value


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The value to filter for</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### resources.properties.eventTrigger.channel


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The name of the channel associated with the trigger in projects/{project}/locations/{location}/channels/{channel} format. If you omit this property, the function will listen for events on the project&#x27;s default channel.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.eventTrigger.triggerRegion


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The trigger will only receive events originating in this region. It can be the same region as the function, a different region or multi-region, or the global region. If not provided, defaults to the same region as the function.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### resources.properties.scheduleTrigger


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A function triggered at a regular interval by a Cloud Scheduler job</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### resources.properties.scheduleTrigger.schedule


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The frequency at which you want the function to run. Accepts unix-cron (https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules) or App Engine (https://cloud.google.com/appengine/docs/standard/nodejs/scheduling-jobs-with-cron-yaml#defining_the_cron_job_schedule) syntax.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.scheduleTrigger.timeZone


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The time zone in which the schedule will run. Defaults to UTC.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### resources.properties.taskQueueTrigger


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A function triggered by a Cloud Task</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>




### resources.properties.buildConfig


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Build configuration for a  gen 2 Cloud Function</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### resources.properties.buildConfig.runtime


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Runtime environment for the function. Defaults to the most recent LTS version of node.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.buildConfig.entryPoint


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The entry point for a function resource</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### resources.properties.serviceConfig


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Service configuration for a  gen 2 Cloud Function</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### resources.properties.serviceConfig.timeoutSeconds


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The function&#x27;s maximum execution time. Default: 60, max value: 540.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### resources.properties.serviceConfig.availableMemory


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The amount of memory available for a function. Defaults to 256M. Supported units are k, M, G, Mi, Gi. If no unit is supplied, the value is interpreted as bytes.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>







## lifecycleEvents


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### lifecycleEvents.onInstall


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### lifecycleEvents.onInstall.function


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Name of the task queue-triggered function that will handle the event. This function must be a taskQueueTriggered function declared in the resources section.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### lifecycleEvents.onInstall.processingMessage


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Message to display in the Firebase console while the task is in progress.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### lifecycleEvents.onUpdate


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### lifecycleEvents.onUpdate.function


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Name of the task queue-triggered function that will handle the event. This function must be a taskQueueTriggered function declared in the resources section.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### lifecycleEvents.onUpdate.processingMessage


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Message to display in the Firebase console while the task is in progress.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### lifecycleEvents.onConfigure


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### lifecycleEvents.onConfigure.function


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Name of the task queue-triggered function that will handle the event. This function must be a taskQueueTriggered function declared in the resources section.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### lifecycleEvents.onConfigure.processingMessage


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Message to display in the Firebase console while the task is in progress.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






## events


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### events.type


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The type identifier of the event. Construct the identifier out of 3-4 dot-delimited fields: the publisher ID, extension name, and event name fields are required; the version field is recommended. Choose a unique and descriptive event name for each event type you publish.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### events.description


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A description of the event</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>










<hr />

## Schema
```
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "$id": "extension.yaml",
    "additionalProperties": false,
    "definitions": {
        "author": {
            "additionalProperties": false,
            "type": "object",
            "properties": {
                "authorName": {
                    "type": "string",
                    "description": "The author's name"
                },
                "email": {
                    "type": "string",
                    "description": "A contact email for the author"
                },
                "url": {
                    "type": "string",
                    "description": "URL of the author's website"
                }
            }
        },
        "role": {
            "additionalProperties": false,
            "type": "object",
            "description": "An IAM role to grant to this extension.",
            "properties": {
                "role": {
                    "type": "string",
                    "description": "Name of the IAM role to grant. Must be on the list of allowed roles: https://firebase.google.com/docs/extensions/publishers/access#supported-roles",
                    "pattern": "[a-zA-Z]+\\.[a-zA-Z]+"
                },
                "reason": {
                    "type": "string",
                    "description": "Why this extension needs this IAM role"
                },
                "resource": {
                    "type": "string",
                    "description": "What resource to grant this role on. If omitted, defaults to projects/${project_id}"
                }
            },
            "required": [
                "role",
                "reason"
            ]
        },
        "api": {
            "additionalProperties": false,
            "type": "object",
            "description": "A Google API used by this extension. Will be enabled on extension deployment.",
            "properties": {
                "apiName": {
                    "type": "string",
                    "description": "Name of the Google API to enable. Should match the service name listed in https://console.cloud.google.com/apis/library",
                    "pattern": "[^\\.]+\\.googleapis\\.com"
                },
                "reason": {
                    "type": "string",
                    "description": "Why this extension needs this API enabled"
                }
            },
            "required": [
                "apiName",
                "reason"
            ]
        },
        "externalService": {
            "additionalProperties": false,
            "type": "object",
            "description": "A non-Google API used by this extension",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Name of the external service"
                },
                "pricingUri": {
                    "type": "string",
                    "description": "URI to pricing information for the service"
                }
            }
        },
        "param": {
            "additionalProperties": false,
            "type": "object",
            "description": "A parameter that users installing this extension can configure",
            "properties": {
                "param": {
                    "type": "string",
                    "description": "The name of the param. This is how you reference the param in your code"
                },
                "label": {
                    "type": "string",
                    "description": "Short description for the parameter. Displayed to users when they're prompted for the parameter's value."
                },
                "description": {
                    "type": "string",
                    "description": "Detailed description for the parameter. Displayed to users when they're prompted for the parameter's value."
                },
                "example": {
                    "type": "string",
                    "description": "Example value for the parameter."
                },
                "validationRegex": {
                    "type": "string",
                    "description": "Regular expression for validation of the parameter's user-configured value. Uses Google RE2 syntax."
                },
                "validationErrorMessage": {
                    "type": "string",
                    "description": "Error message to display if regex validation fails."
                },
                "default": {
                    "type": "string",
                    "description": "Default value for the parameter if the user leaves the parameter's value blank."
                },
                "required": {
                    "type": "boolean",
                    "description": "Defines whether the user can submit an empty string when they're prompted for the parameter's value. Defaults to true."
                },
                "immutable": {
                    "type": "boolean",
                    "description": "Defines whether the user can change the parameter's value after installation (such as if they reconfigure the extension). Defaults to false."
                },
                "advanced": {
                    "type": "boolean",
                    "description": "Whether this a param for advanced users. When true, only users who choose 'advanced configuration' will see this param."
                },
                "type": {
                    "type": "string",
                    "description": "The parameter type. Special parameter types might have additional requirements or different UI presentation. See https://firebase.google.com/docs/extensions/reference/extension-yaml#params for more details.",
                    "pattern": "string|select|multiSelect|secret|selectResource"
                },
                "resourceType": {
                    "type": "string",
                    "description": "The type of resource to prompt the user to select. Provides a special UI treatment for the param.",
                    "pattern": "storage\\.googleapis\\.com\\/Bucket|firestore\\.googleapis\\.com\\/Database|firebasedatabase\\.googleapis\\.com\\/DatabaseInstance"
                },
                "options": {
                    "type": "array",
                    "description": "Options for a select or multiSelect type param.",
                    "items": {
                        "$ref": "#/definitions/paramOption"
                    }
                }
            },
            "required": [
                "param"
            ]
        },
        "paramOption": {
            "additionalProperties": false,
            "type": "object",
            "properties": {
                "value": {
                    "type": "string",
                    "description": "One of the values the user can choose. This is the value you get when you read the parameter value in code."
                },
                "label": {
                    "type": "string",
                    "description": "Short description of the selectable option. If omitted, defaults to value."
                }
            },
            "required": [
                "value"
            ]
        },
        "resource": {
            "additionalProperties": false,
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The name of this resource"
                },
                "type": {
                    "type": "string",
                    "description": "What type of resource this is. See https://firebase.google.com/docs/extensions/reference/extension-yaml#resources for a full list of options."
                },
                "description": {
                    "type": "string",
                    "description": "A brief description of what this resource does"
                },
                "properties": {
                    "type": "object",
                    "description": "The properties of this resource",
                    "additionalProperties": true,
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "The location for this resource"
                        },
                        "entryPoint": {
                            "type": "string",
                            "description": "The entry point for a function resource"
                        },
                        "sourceDirectory": {
                            "type": "string",
                            "description": "Directory that contains your package.json at its root. The file for your functions source code must be in this directory. Defaults to functions"
                        },
                        "timeout": {
                            "type": "string",
                            "description": "A function resources's maximum execution time.",
                            "pattern": "\\d+s"
                        },
                        "availableMemoryMb": {
                            "type": "string",
                            "description": "Amount of memory in MB available for the function.",
                            "pattern": "\\d+"
                        },
                        "runtime": {
                            "type": "string",
                            "description": "Runtime environment for the function. Defaults to the most recent LTS version of node."
                        },
                        "httpsTrigger": {
                            "type": "object",
                            "description": "A function triggered by HTTPS calls",
                            "properties": {}
                        },
                        "eventTrigger": {
                            "type": "object",
                            "description": "A function triggered by a background event",
                            "properties": {
                                "eventType": {
                                    "type": "string",
                                    "description": "The type of background event to trigger on. See https://firebase.google.com/docs/extensions/publishers/functions#supported for a full list."
                                },
                                "resource": {
                                    "type": "string",
                                    "description": "The name or pattern of the resource to trigger on"
                                },
                                "eventFilters": {
                                    "type": "array",
                                    "description": "Filters that further limit the events to listen to.",
                                    "items": {
                                        "$ref": "#/definitions/eventFilter"
                                    }
                                },
                                "channel": {
                                    "type": "string",
                                    "description": "The name of the channel associated with the trigger in projects/{project}/locations/{location}/channels/{channel} format. If you omit this property, the function will listen for events on the project's default channel."
                                },
                                "triggerRegion": {
                                    "type": "string",
                                    "description": "The trigger will only receive events originating in this region. It can be the same region as the function, a different region or multi-region, or the global region. If not provided, defaults to the same region as the function."
                                }
                            },
                            "required": [
                                "eventType"
                            ]
                        },
                        "scheduleTrigger": {
                            "type": "object",
                            "description": "A function triggered at a regular interval by a Cloud Scheduler job",
                            "properties": {
                                "schedule": {
                                    "type": "string",
                                    "description": "The frequency at which you want the function to run. Accepts unix-cron (https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules) or App Engine (https://cloud.google.com/appengine/docs/standard/nodejs/scheduling-jobs-with-cron-yaml#defining_the_cron_job_schedule) syntax."
                                },
                                "timeZone": {
                                    "type": "string",
                                    "description": "The time zone in which the schedule will run. Defaults to UTC."
                                }
                            },
                            "required": [
                                "schedule"
                            ]
                        },
                        "taskQueueTrigger": {
                            "type": "object",
                            "description": "A function triggered by a Cloud Task",
                            "properties": {}
                        },
                        "buildConfig": {
                            "type": "object",
                            "description": "Build configuration for a  gen 2 Cloud Function",
                            "properties": {
                                "runtime": {
                                    "type": "string",
                                    "description": "Runtime environment for the function. Defaults to the most recent LTS version of node."
                                },
                                "entryPoint": {
                                    "type": "string",
                                    "description": "The entry point for a function resource"
                                }
                            }
                        },
                        "serviceConfig": {
                            "type": "object",
                            "description": "Service configuration for a  gen 2 Cloud Function",
                            "properties": {
                                "timeoutSeconds": {
                                    "type": "string",
                                    "description": "The function's maximum execution time. Default: 60, max value: 540."
                                },
                                "availableMemory": {
                                    "type": "string",
                                    "description": "The amount of memory available for a function. Defaults to 256M. Supported units are k, M, G, Mi, Gi. If no unit is supplied, the value is interpreted as bytes."
                                }
                            }
                        }
                    }
                }
            },
            "required": [
                "name",
                "type",
                "description",
                "properties"
            ]
        },
        "lifecycleEvent": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "onInstall": {
                    "$ref": "#/definitions/lifecycleEventSpec"
                },
                "onUpdate": {
                    "$ref": "#/definitions/lifecycleEventSpec"
                },
                "onConfigure": {
                    "$ref": "#/definitions/lifecycleEventSpec"
                }
            }
        },
        "lifecycleEventSpec": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "function": {
                    "type": "string",
                    "description": "Name of the task queue-triggered function that will handle the event. This function must be a taskQueueTriggered function declared in the resources section."
                },
                "processingMessage": {
                    "type": "string",
                    "description": "Message to display in the Firebase console while the task is in progress."
                }
            }
        },
        "event": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "type": {
                    "type": "string",
                    "description": "The type identifier of the event. Construct the identifier out of 3-4 dot-delimited fields: the publisher ID, extension name, and event name fields are required; the version field is recommended. Choose a unique and descriptive event name for each event type you publish."
                },
                "description": {
                    "type": "string",
                    "description": "A description of the event"
                }
            }
        },
        "eventFilter": {
            "type": "object",
            "properties": {
                "attribute": {
                    "type": "string",
                    "description": "The event attribute to filter on"
                },
                "value": {
                    "type": "string",
                    "description": "The value to filter for"
                }
            }
        }
    },
    "properties": {
        "name": {
            "type": "string",
            "description": "ID of this extension (ie your-extension-name)"
        },
        "version": {
            "type": "string",
            "description": "Version of this extension. Follows https://semver.org/."
        },
        "specVersion": {
            "type": "string",
            "description": "Version of the extension.yaml spec that this file follows. Currently always 'v1beta'"
        },
        "license": {
            "type": "string",
            "description": "The software license agreement for this extension. Currently, only 'Apache-2.0' is permitted on extensions.dev"
        },
        "displayName": {
            "type": "string",
            "description": "Human readable name for this extension (ie 'Your Extension Name')"
        },
        "description": {
            "type": "string",
            "description": "A one to two sentence description of what this extension does"
        },
        "icon": {
            "type": "string",
            "description": "The file name of this extension's icon"
        },
        "billingRequired": {
            "type": "boolean",
            "description": "Whether this extension requires a billing to be enabled on the project it is installed on"
        },
        "tags": {
            "type": "array",
            "items": {
                "type": "string"
            },
            "description": "A list of tags to help users find your extension in search"
        },
        "sourceUrl": {
            "type": "string",
            "description": "The URL of the GitHub repo hosting this code"
        },
        "releaseNotesUrl": {
            "type": "string",
            "description": "A URL where users can view the full changelog or release notes for this extension"
        },
        "author": {
            "$ref": "#/definitions/author"
        },
        "contributors": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/author"
            }
        },
        "apis": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/api"
            }
        },
        "roles": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/role"
            }
        },
        "externalServices": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/externalService"
            }
        },
        "params": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/param"
            }
        },
        "resources": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/resource"
            }
        },
        "lifecycleEvents": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/lifecycleEvent"
            }
        },
        "events": {
            "type": "array",
            "items": {
                "$ref": "#/definitions/event"
            }
        }
    }
}
```


