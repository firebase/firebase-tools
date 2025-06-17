

# Information about the resources in your Firebase project.
This used for declarative deployments via &#x60;firebase deploy&#x60; and local emulation via &#x60;firebase emulators:start&#x60;



<table>
<tbody>

<tr><th>$schema</th><td>http://json-schema.org/draft-07/schema#</td></tr>
</tbody>
</table>

## Properties

<table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td colspan="2"><a href="#$schema">$schema</a></td><td>String</td></tr><tr><td rowspan="2">apphosting</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td rowspan="2">database</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td rowspan="2">dataconnect</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td colspan="2"><a href="#emulators">emulators</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#extensions">extensions</a></td><td>Object</td></tr><tr><td rowspan="2">firestore</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td rowspan="2">functions</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td rowspan="2">hosting</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr><tr><td colspan="2"><a href="#remoteconfig">remoteconfig</a></td><td>Object</td></tr><tr><td rowspan="2">storage</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr></tbody></table>



<hr />


## $schema


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Unused. Included in schema so that the schema can be applied to single files.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    <tr>
      <th>Format</th>
      <td colspan="2">uri</td>
    </tr>
  </tbody>
</table>




## apphosting


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The App Hosting backend(s) that should be deployed or emulated.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### apphosting.0


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A single App Hosting deployment configs</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### apphosting.0.alwaysDeployFromSource


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">If true, this backend will only be deployed from local source, not from source control.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### apphosting.0.backendId


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### apphosting.0.ignore


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A list of file paths to exclude from the archive that is uploaded for this backend.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### apphosting.0.rootDir


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### apphosting.1


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A list of App Hosting deployment configs</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### apphosting.1.alwaysDeployFromSource


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">If true, this backend will only be deployed from local source, not from source control.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### apphosting.1.backendId


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### apphosting.1.ignore


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A list of file paths to exclude from the archive that is uploaded for this backend.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### apphosting.1.rootDir


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






## database


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Realtime Database rules that should be deployed or emulated.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### database.0


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Deployment options for a single Realtime Database instance.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### database.0.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### database.0.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### database.0.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### database.0.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### database.0.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### database.0.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### database.0.rules


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The rules files for this Realtime Database instance.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### database.1


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Deployment options for a list of Realtime Database instancs.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>





## dataconnect


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Data Connect service(s) that should be deployed or emulated.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### dataconnect.0


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A single Data Connect deployment configs</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### dataconnect.0.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### dataconnect.0.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### dataconnect.0.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### dataconnect.0.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### dataconnect.0.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### dataconnect.0.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### dataconnect.0.source


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### dataconnect.1


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A list of Data Connect deployment configs</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### dataconnect.1.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### dataconnect.1.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### dataconnect.1.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### dataconnect.1.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### dataconnect.1.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### dataconnect.1.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### dataconnect.1.source


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






## emulators


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Hosts, ports, and configuration options for the Firebase Emulator suite.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>

### Properties
  <table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td colspan="2"><a href="#emulatorsapphosting">apphosting</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorsauth">auth</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorsdatabase">database</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorsdataconnect">dataconnect</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorseventarc">eventarc</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorsextensions">extensions</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorsfirestore">firestore</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorshosting">hosting</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorshub">hub</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorslogging">logging</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorspubsub">pubsub</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorssingleprojectmode">singleProjectMode</a></td><td>Boolean</td></tr><tr><td colspan="2"><a href="#emulatorsstorage">storage</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorstasks">tasks</a></td><td>Object</td></tr><tr><td colspan="2"><a href="#emulatorsui">ui</a></td><td>Object</td></tr></tbody></table>


### emulators.apphosting


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the App Hosting emulator</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.apphosting.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.apphosting.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.apphosting.rootDirectory


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The root directory of your app. The start command will ran from this directory.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.apphosting.startCommand


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The command that will be run to start your app when emulating your App Hosting backend</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.apphosting.startCommandOverride


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.auth


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Auth emulator</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.auth.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.auth.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.database


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Realtime Database emulator</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.database.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.database.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.dataconnect


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Data Connect emulator.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.dataconnect.dataDir


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The directory to persist emulator data to. If set, data will be saved between runs automatically.
If the --import flag is used, the current data will be overwritten by the imported data.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.dataconnect.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.dataconnect.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.dataconnect.postgresHost


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Host for the Postgres database that backs the Data Connect emulator.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.dataconnect.postgresPort


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Port for the Postgres database that backs the Data Connect emulator.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.eventarc


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the EventArc emulator.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.eventarc.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.eventarc.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.extensions


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Placeholder - the Extensions emulator has no configuration options.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.firestore


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Firestore emulator</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.firestore.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.firestore.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.firestore.websocketPort


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.hosting


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Firebase Hosting emulator</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.hosting.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.hosting.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.hub


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the emulator suite hub.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.hub.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.hub.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.logging


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the logging emulator.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.logging.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.logging.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.pubsub


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Pub/Sub emulator</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.pubsub.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.pubsub.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.singleProjectMode


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">If true, the Emulator Suite will only allow a single project to be used at a time.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.storage


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Firebase Storage emulator</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.storage.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.storage.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.tasks


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Cloud Tasks emulator.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.tasks.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.tasks.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>





### emulators.ui


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Config for the Emulator UI.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### emulators.ui.enabled


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">If false, the Emulator UI will not be served.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.ui.host


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The host that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




### emulators.ui.port


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The port that this emulator will serve on.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>






## extensions


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Firebase Extension(s) that should be deployed or emulated.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>




## firestore


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Firestore rules and indexes that should be deployed or emulated.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### firestore.0


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Deployment options for a single Firestore database.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### firestore.0.database


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The id of the Firestore database to deploy. If omitted, defaults to &#x27;(default)&#x27;</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### firestore.0.indexes


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the firestore indexes file</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### firestore.0.location


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The region of the Firestore database to deploy. Required when &#x27;database&#x27; is set.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### firestore.0.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### firestore.0.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### firestore.0.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### firestore.0.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### firestore.0.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### firestore.0.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### firestore.0.rules


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the firestore rules file</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### firestore.1


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Deployment options for a list of Firestore databases.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>





## functions


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Cloud Functions for Firebase that should be deployed or emulated.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### functions.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### functions.0.codebase


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The codebase that these functions are part of. You can use codebases to control which functions are deployed
 ie: &#x60;firebase deploy --only functions:my-codebase&#x60;</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### functions.0.ignore


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Files in the source directory that should not be uploaed during dpeloyment.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### functions.0.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### functions.0.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### functions.0.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### functions.0.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### functions.0.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### functions.0.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### functions.0.runtime


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The runtime these functions should use.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Enum</th>
      <td colspan="2"><ul><li>nodejs20</li><li>nodejs22</li><li>python310</li><li>python311</li><li>python312</li><li>python313</li></ul></td>
    </tr>
  </tbody>
</table>




### functions.0.source


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The directory containing your functions source code.
This directory will be archived and uploaded during deployment.
Files outside of this directory will not be included and should not be referenced from your functions code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### functions.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### functions.1.codebase


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The codebase that these functions are part of. You can use codebases to control which functions are deployed
 ie: &#x60;firebase deploy --only functions:my-codebase&#x60;</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### functions.1.ignore


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Files in the source directory that should not be uploaed during dpeloyment.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### functions.1.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### functions.1.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### functions.1.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### functions.1.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### functions.1.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### functions.1.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### functions.1.runtime


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The runtime these functions should use.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Enum</th>
      <td colspan="2"><ul><li>nodejs20</li><li>nodejs22</li><li>python310</li><li>python311</li><li>python312</li><li>python313</li></ul></td>
    </tr>
  </tbody>
</table>




### functions.1.source


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The directory containing your functions source code.
This directory will be archived and uploaded during deployment.
Files outside of this directory will not be included and should not be referenced from your functions code.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>






## hosting


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Firebase Hosting site(s) that should be deployed or emulated.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### hosting.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### hosting.0.appAssociation


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Enum</th>
      <td colspan="2"><ul><li>AUTO</li><li>NONE</li></ul></td>
    </tr>
  </tbody>
</table>




### hosting.0.cleanUrls


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### hosting.0.frameworksBackend.concurrency


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Number of requests a function can serve at once.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.cors


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">If true, allows CORS on requests to this function.
If this is a &#x60;string&#x60; or &#x60;RegExp&#x60;, allows requests from domains that match the provided value.
If this is an &#x60;Array&#x60;, allows requests from domains matching at least one entry of the array.
Defaults to true for {@link https.CallableFunction} and false otherwise.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">[string, boolean]</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.cpu


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Fractional number of CPUs to allocate to a function.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>String</td></tr><tr><td>Number</td></tr></tr>
    
  </tbody>
</table>



### hosting.0.frameworksBackend.cpu.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Const</th>
      <td colspan="2">gcf_gen1</td>
    </tr>
  </tbody>
</table>




### hosting.0.frameworksBackend.cpu.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    
  </tbody>
</table>





### hosting.0.frameworksBackend.enforceAppCheck


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Determines whether Firebase AppCheck is enforced. Defaults to false.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.ingressSettings


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Ingress settings which control where this function can be called from.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Enum</th>
      <td colspan="2"><ul><li>ALLOW_ALL</li><li>ALLOW_INTERNAL_AND_GCLB</li><li>ALLOW_INTERNAL_ONLY</li></ul></td>
    </tr>
  </tbody>
</table>




### hosting.0.frameworksBackend.invoker


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Invoker to set access control on https functions.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Const</th>
      <td colspan="2">public</td>
    </tr>
  </tbody>
</table>




### hosting.0.frameworksBackend.labels


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">User labels to set on the function.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.maxInstances


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Max number of instances to be running in parallel.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.memory


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Amount of memory to allocate to a function.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Enum</th>
      <td colspan="2"><ul><li>128MiB</li><li>16GiB</li><li>1GiB</li><li>256MiB</li><li>2GiB</li><li>32GiB</li><li>4GiB</li><li>512MiB</li><li>8GiB</li></ul></td>
    </tr>
  </tbody>
</table>




### hosting.0.frameworksBackend.minInstances


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Min number of actual instances to be running at a given time.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.omit


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">If true, do not deploy or emulate this function.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.preserveExternalChanges


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Controls whether function configuration modified outside of function source is preserved. Defaults to false.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.region


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">HTTP functions can override global options and can specify multiple regions to deploy to.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.secrets


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.serviceAccount


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Specific service account for the function to run as.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.timeoutSeconds


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Timeout for the function in seconds, possible values are 0 to 540.
HTTPS functions can specify a higher timeout.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Number</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.vpcConnector


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Connect cloud function to specified VPC connector.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### hosting.0.frameworksBackend.vpcConnectorEgressSettings


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Egress settings for VPC connector.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Enum</th>
      <td colspan="2"><ul><li>ALL_TRAFFIC</li><li>PRIVATE_RANGES_ONLY</li></ul></td>
    </tr>
  </tbody>
</table>





### hosting.0.headers


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### hosting.0.i18n


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### hosting.0.i18n.root


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### hosting.0.ignore


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### hosting.0.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### hosting.0.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### hosting.0.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### hosting.0.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### hosting.0.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### hosting.0.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### hosting.0.public


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### hosting.0.redirects


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### hosting.0.rewrites


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### hosting.0.site


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### hosting.0.source


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### hosting.0.target


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### hosting.0.trailingSlash


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Boolean</td></tr>
    
  </tbody>
</table>





### hosting.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>





## remoteconfig


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Remote Config template(s) used by this project.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>

### Properties
  <table class="jssd-properties-table"><thead><tr><th colspan="2">Name</th><th>Type</th></tr></thead><tbody><tr><td rowspan="2">postdeploy</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr><tr><td rowspan="2">predeploy</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr><tr><td colspan="2"><a href="#remoteconfigtemplate">template</a></td><td>String</td></tr></tbody></table>


### remoteconfig.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### remoteconfig.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### remoteconfig.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### remoteconfig.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### remoteconfig.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### remoteconfig.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### remoteconfig.template


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">Yes</td>
    </tr>
    
  </tbody>
</table>





## storage


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Firebase Storage rules that should be deployed or emulated.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Object</td></tr><tr><td>Array</td></tr></tr>
    <tr>
      <th>Required</th>
      <td colspan="2">No</td>
    </tr>
    
  </tbody>
</table>



### storage.0


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Deployment options for a single Firebase storage bucket.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Object</td></tr>
    
  </tbody>
</table>



### storage.0.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### storage.0.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### storage.0.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### storage.0.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### storage.0.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### storage.0.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### storage.0.rules


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the rules files for this Firebase Storage bucket.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### storage.0.target


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### storage.1


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Deployment options for multiple Firebase storage buckets.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>



### storage.1.bucket


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">The Firebase Storage bucket that this config is for.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### storage.1.postdeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran after this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### storage.1.postdeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### storage.1.postdeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### storage.1.predeploy


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">A script or list of scripts that will be ran before this product is deployed.</td>
    </tr>
    <tr><tr><td rowspan="2">Type</td><td rowspan="2">Any of:</td><td>Array</td></tr><tr><td>String</td></tr></tr>
    
  </tbody>
</table>



### storage.1.predeploy.0


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">Array</td></tr>
    
  </tbody>
</table>




### storage.1.predeploy.1


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>





### storage.1.rules


<table class="jssd-property-table">
  <tbody>
    <tr>
      <th>Description</th>
      <td colspan="2">Path to the rules files for this Firebase Storage bucket.</td>
    </tr>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>




### storage.1.target


<table class="jssd-property-table">
  <tbody>
    <tr><th>Type</th><td colspan="2">String</td></tr>
    
  </tbody>
</table>











<hr />

## Schema
```
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "additionalProperties": false,
    "definitions": {
        "DataConnectSingle": {
            "additionalProperties": false,
            "description": "A single Data Connect deployment configs",
            "properties": {
                "postdeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran after this product is deployed."
                },
                "predeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran before this product is deployed."
                },
                "source": {
                    "type": "string"
                }
            },
            "required": [
                "source"
            ],
            "type": "object"
        },
        "DatabaseSingle": {
            "additionalProperties": false,
            "description": "Deployment options for a single Realtime Database instance.",
            "properties": {
                "postdeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran after this product is deployed."
                },
                "predeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran before this product is deployed."
                },
                "rules": {
                    "description": "The rules files for this Realtime Database instance.",
                    "type": "string"
                }
            },
            "required": [
                "rules"
            ],
            "type": "object"
        },
        "ExtensionsConfig": {
            "additionalProperties": false,
            "description": "The Firebase Extensions that should be deployed to this project.\nThis is a map of instance ID to extension reference (<publisherId>/<extensionId>@<version>)- ie:\n\"my-firestore-export\": \"firebase/firestore-bigquery-export@1.2.3\"\n\nVersion can also be a semver range.",
            "type": "object"
        },
        "FirestoreSingle": {
            "additionalProperties": false,
            "description": "Deployment options for a single Firestore database.",
            "properties": {
                "database": {
                    "description": "The id of the Firestore database to deploy. If omitted, defaults to '(default)'",
                    "type": "string"
                },
                "indexes": {
                    "description": "Path to the firestore indexes file",
                    "type": "string"
                },
                "location": {
                    "description": "The region of the Firestore database to deploy. Required when 'database' is set.",
                    "type": "string"
                },
                "postdeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran after this product is deployed."
                },
                "predeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran before this product is deployed."
                },
                "rules": {
                    "description": "Path to the firestore rules file",
                    "type": "string"
                }
            },
            "type": "object"
        },
        "FrameworksBackendOptions": {
            "additionalProperties": false,
            "properties": {
                "concurrency": {
                    "description": "Number of requests a function can serve at once.",
                    "type": "number"
                },
                "cors": {
                    "description": "If true, allows CORS on requests to this function.\nIf this is a `string` or `RegExp`, allows requests from domains that match the provided value.\nIf this is an `Array`, allows requests from domains matching at least one entry of the array.\nDefaults to true for {@link https.CallableFunction} and false otherwise.",
                    "type": [
                        "string",
                        "boolean"
                    ]
                },
                "cpu": {
                    "anyOf": [
                        {
                            "const": "gcf_gen1",
                            "type": "string"
                        },
                        {
                            "type": "number"
                        }
                    ],
                    "description": "Fractional number of CPUs to allocate to a function."
                },
                "enforceAppCheck": {
                    "description": "Determines whether Firebase AppCheck is enforced. Defaults to false.",
                    "type": "boolean"
                },
                "ingressSettings": {
                    "description": "Ingress settings which control where this function can be called from.",
                    "enum": [
                        "ALLOW_ALL",
                        "ALLOW_INTERNAL_AND_GCLB",
                        "ALLOW_INTERNAL_ONLY"
                    ],
                    "type": "string"
                },
                "invoker": {
                    "const": "public",
                    "description": "Invoker to set access control on https functions.",
                    "type": "string"
                },
                "labels": {
                    "$ref": "#/definitions/Record<string,string>",
                    "description": "User labels to set on the function."
                },
                "maxInstances": {
                    "description": "Max number of instances to be running in parallel.",
                    "type": "number"
                },
                "memory": {
                    "description": "Amount of memory to allocate to a function.",
                    "enum": [
                        "128MiB",
                        "16GiB",
                        "1GiB",
                        "256MiB",
                        "2GiB",
                        "32GiB",
                        "4GiB",
                        "512MiB",
                        "8GiB"
                    ],
                    "type": "string"
                },
                "minInstances": {
                    "description": "Min number of actual instances to be running at a given time.",
                    "type": "number"
                },
                "omit": {
                    "description": "If true, do not deploy or emulate this function.",
                    "type": "boolean"
                },
                "preserveExternalChanges": {
                    "description": "Controls whether function configuration modified outside of function source is preserved. Defaults to false.",
                    "type": "boolean"
                },
                "region": {
                    "description": "HTTP functions can override global options and can specify multiple regions to deploy to.",
                    "type": "string"
                },
                "secrets": {
                    "items": {
                        "type": "string"
                    },
                    "type": "array"
                },
                "serviceAccount": {
                    "description": "Specific service account for the function to run as.",
                    "type": "string"
                },
                "timeoutSeconds": {
                    "description": "Timeout for the function in seconds, possible values are 0 to 540.\nHTTPS functions can specify a higher timeout.",
                    "type": "number"
                },
                "vpcConnector": {
                    "description": "Connect cloud function to specified VPC connector.",
                    "type": "string"
                },
                "vpcConnectorEgressSettings": {
                    "description": "Egress settings for VPC connector.",
                    "enum": [
                        "ALL_TRAFFIC",
                        "PRIVATE_RANGES_ONLY"
                    ],
                    "type": "string"
                }
            },
            "type": "object"
        },
        "FunctionConfig": {
            "additionalProperties": false,
            "properties": {
                "codebase": {
                    "description": "The codebase that these functions are part of. You can use codebases to control which functions are deployed\n ie: `firebase deploy --only functions:my-codebase`",
                    "type": "string"
                },
                "ignore": {
                    "description": "Files in the source directory that should not be uploaed during dpeloyment.",
                    "items": {
                        "type": "string"
                    },
                    "type": "array"
                },
                "postdeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran after this product is deployed."
                },
                "predeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran before this product is deployed."
                },
                "runtime": {
                    "description": "The runtime these functions should use.",
                    "enum": [
                        "nodejs20",
                        "nodejs22",
                        "python310",
                        "python311",
                        "python312",
                        "python313"
                    ],
                    "type": "string"
                },
                "source": {
                    "description": "The directory containing your functions source code.\nThis directory will be archived and uploaded during deployment.\nFiles outside of this directory will not be included and should not be referenced from your functions code.",
                    "type": "string"
                }
            },
            "type": "object"
        },
        "HostingHeaders": {
            "anyOf": [
                {
                    "additionalProperties": false,
                    "properties": {
                        "glob": {
                            "type": "string"
                        },
                        "headers": {
                            "items": {
                                "additionalProperties": false,
                                "properties": {
                                    "key": {
                                        "type": "string"
                                    },
                                    "value": {
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "key",
                                    "value"
                                ],
                                "type": "object"
                            },
                            "type": "array"
                        }
                    },
                    "required": [
                        "glob",
                        "headers"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "headers": {
                            "items": {
                                "additionalProperties": false,
                                "properties": {
                                    "key": {
                                        "type": "string"
                                    },
                                    "value": {
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "key",
                                    "value"
                                ],
                                "type": "object"
                            },
                            "type": "array"
                        },
                        "source": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "headers",
                        "source"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "headers": {
                            "items": {
                                "additionalProperties": false,
                                "properties": {
                                    "key": {
                                        "type": "string"
                                    },
                                    "value": {
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "key",
                                    "value"
                                ],
                                "type": "object"
                            },
                            "type": "array"
                        },
                        "regex": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "headers",
                        "regex"
                    ],
                    "type": "object"
                }
            ]
        },
        "HostingRedirects": {
            "anyOf": [
                {
                    "additionalProperties": false,
                    "properties": {
                        "destination": {
                            "type": "string"
                        },
                        "glob": {
                            "type": "string"
                        },
                        "type": {
                            "type": "number"
                        }
                    },
                    "required": [
                        "destination",
                        "glob"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "destination": {
                            "type": "string"
                        },
                        "source": {
                            "type": "string"
                        },
                        "type": {
                            "type": "number"
                        }
                    },
                    "required": [
                        "destination",
                        "source"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "destination": {
                            "type": "string"
                        },
                        "regex": {
                            "type": "string"
                        },
                        "type": {
                            "type": "number"
                        }
                    },
                    "required": [
                        "destination",
                        "regex"
                    ],
                    "type": "object"
                }
            ]
        },
        "HostingRewrites": {
            "anyOf": [
                {
                    "additionalProperties": false,
                    "properties": {
                        "destination": {
                            "type": "string"
                        },
                        "glob": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "destination",
                        "glob"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "function": {
                            "type": "string"
                        },
                        "glob": {
                            "type": "string"
                        },
                        "region": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "function",
                        "glob"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "function": {
                            "additionalProperties": false,
                            "properties": {
                                "functionId": {
                                    "type": "string"
                                },
                                "pinTag": {
                                    "type": "boolean"
                                },
                                "region": {
                                    "type": "string"
                                }
                            },
                            "required": [
                                "functionId"
                            ],
                            "type": "object"
                        },
                        "glob": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "function",
                        "glob"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "glob": {
                            "type": "string"
                        },
                        "run": {
                            "additionalProperties": false,
                            "properties": {
                                "pinTag": {
                                    "description": "If true, traffic will be pinned to the currently running version of the Cloud Run service.",
                                    "type": "boolean"
                                },
                                "region": {
                                    "type": "string"
                                },
                                "serviceId": {
                                    "description": "The ID of the Cloud Run service to rewrite to.",
                                    "type": "string"
                                }
                            },
                            "required": [
                                "serviceId"
                            ],
                            "type": "object"
                        }
                    },
                    "required": [
                        "glob",
                        "run"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "dynamicLinks": {
                            "type": "boolean"
                        },
                        "glob": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "dynamicLinks",
                        "glob"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "destination": {
                            "type": "string"
                        },
                        "source": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "destination",
                        "source"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "function": {
                            "type": "string"
                        },
                        "region": {
                            "type": "string"
                        },
                        "source": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "function",
                        "source"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "function": {
                            "additionalProperties": false,
                            "properties": {
                                "functionId": {
                                    "type": "string"
                                },
                                "pinTag": {
                                    "type": "boolean"
                                },
                                "region": {
                                    "type": "string"
                                }
                            },
                            "required": [
                                "functionId"
                            ],
                            "type": "object"
                        },
                        "source": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "function",
                        "source"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "run": {
                            "additionalProperties": false,
                            "properties": {
                                "pinTag": {
                                    "description": "If true, traffic will be pinned to the currently running version of the Cloud Run service.",
                                    "type": "boolean"
                                },
                                "region": {
                                    "type": "string"
                                },
                                "serviceId": {
                                    "description": "The ID of the Cloud Run service to rewrite to.",
                                    "type": "string"
                                }
                            },
                            "required": [
                                "serviceId"
                            ],
                            "type": "object"
                        },
                        "source": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "run",
                        "source"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "dynamicLinks": {
                            "type": "boolean"
                        },
                        "source": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "dynamicLinks",
                        "source"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "destination": {
                            "type": "string"
                        },
                        "regex": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "destination",
                        "regex"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "function": {
                            "type": "string"
                        },
                        "regex": {
                            "type": "string"
                        },
                        "region": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "function",
                        "regex"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "function": {
                            "additionalProperties": false,
                            "properties": {
                                "functionId": {
                                    "type": "string"
                                },
                                "pinTag": {
                                    "type": "boolean"
                                },
                                "region": {
                                    "type": "string"
                                }
                            },
                            "required": [
                                "functionId"
                            ],
                            "type": "object"
                        },
                        "regex": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "function",
                        "regex"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "regex": {
                            "type": "string"
                        },
                        "run": {
                            "additionalProperties": false,
                            "properties": {
                                "pinTag": {
                                    "description": "If true, traffic will be pinned to the currently running version of the Cloud Run service.",
                                    "type": "boolean"
                                },
                                "region": {
                                    "type": "string"
                                },
                                "serviceId": {
                                    "description": "The ID of the Cloud Run service to rewrite to.",
                                    "type": "string"
                                }
                            },
                            "required": [
                                "serviceId"
                            ],
                            "type": "object"
                        }
                    },
                    "required": [
                        "regex",
                        "run"
                    ],
                    "type": "object"
                },
                {
                    "additionalProperties": false,
                    "properties": {
                        "dynamicLinks": {
                            "type": "boolean"
                        },
                        "regex": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "dynamicLinks",
                        "regex"
                    ],
                    "type": "object"
                }
            ]
        },
        "HostingSingle": {
            "additionalProperties": false,
            "properties": {
                "appAssociation": {
                    "enum": [
                        "AUTO",
                        "NONE"
                    ],
                    "type": "string"
                },
                "cleanUrls": {
                    "type": "boolean"
                },
                "frameworksBackend": {
                    "$ref": "#/definitions/FrameworksBackendOptions"
                },
                "headers": {
                    "items": {
                        "$ref": "#/definitions/HostingHeaders"
                    },
                    "type": "array"
                },
                "i18n": {
                    "additionalProperties": false,
                    "properties": {
                        "root": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "root"
                    ],
                    "type": "object"
                },
                "ignore": {
                    "items": {
                        "type": "string"
                    },
                    "type": "array"
                },
                "postdeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran after this product is deployed."
                },
                "predeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran before this product is deployed."
                },
                "public": {
                    "type": "string"
                },
                "redirects": {
                    "items": {
                        "$ref": "#/definitions/HostingRedirects"
                    },
                    "type": "array"
                },
                "rewrites": {
                    "items": {
                        "$ref": "#/definitions/HostingRewrites"
                    },
                    "type": "array"
                },
                "site": {
                    "type": "string"
                },
                "source": {
                    "type": "string"
                },
                "target": {
                    "type": "string"
                },
                "trailingSlash": {
                    "type": "boolean"
                }
            },
            "type": "object"
        },
        "Record<string,string>": {
            "additionalProperties": false,
            "type": "object"
        },
        "RemoteConfigConfig": {
            "additionalProperties": false,
            "properties": {
                "postdeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran after this product is deployed."
                },
                "predeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran before this product is deployed."
                },
                "template": {
                    "type": "string"
                }
            },
            "required": [
                "template"
            ],
            "type": "object"
        },
        "StorageSingle": {
            "additionalProperties": false,
            "description": "Deployment options for a single Firebase storage bucket.",
            "properties": {
                "postdeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran after this product is deployed."
                },
                "predeploy": {
                    "anyOf": [
                        {
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        {
                            "type": "string"
                        }
                    ],
                    "description": "A script or list of scripts that will be ran before this product is deployed."
                },
                "rules": {
                    "description": "Path to the rules files for this Firebase Storage bucket.",
                    "type": "string"
                },
                "target": {
                    "type": "string"
                }
            },
            "required": [
                "rules"
            ],
            "type": "object"
        }
    },
    "description": "Information about the resources in your Firebase project.\nThis used for declarative deployments via `firebase deploy` and local emulation via `firebase emulators:start`",
    "properties": {
        "$schema": {
            "description": "Unused. Included in schema so that the schema can be applied to single files.",
            "format": "uri",
            "type": "string"
        },
        "apphosting": {
            "anyOf": [
                {
                    "additionalProperties": false,
                    "description": "A single App Hosting deployment configs",
                    "properties": {
                        "alwaysDeployFromSource": {
                            "description": "If true, this backend will only be deployed from local source, not from source control.",
                            "type": "boolean"
                        },
                        "backendId": {
                            "type": "string"
                        },
                        "ignore": {
                            "description": "A list of file paths to exclude from the archive that is uploaded for this backend.",
                            "items": {
                                "type": "string"
                            },
                            "type": "array"
                        },
                        "rootDir": {
                            "type": "string"
                        }
                    },
                    "required": [
                        "backendId",
                        "ignore",
                        "rootDir"
                    ],
                    "type": "object"
                },
                {
                    "description": "A list of App Hosting deployment configs",
                    "items": {
                        "additionalProperties": false,
                        "description": "A single App Hosting deployment configs",
                        "properties": {
                            "alwaysDeployFromSource": {
                                "description": "If true, this backend will only be deployed from local source, not from source control.",
                                "type": "boolean"
                            },
                            "backendId": {
                                "type": "string"
                            },
                            "ignore": {
                                "description": "A list of file paths to exclude from the archive that is uploaded for this backend.",
                                "items": {
                                    "type": "string"
                                },
                                "type": "array"
                            },
                            "rootDir": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "backendId",
                            "ignore",
                            "rootDir"
                        ],
                        "type": "object"
                    },
                    "type": "array"
                }
            ],
            "description": "The App Hosting backend(s) that should be deployed or emulated."
        },
        "database": {
            "anyOf": [
                {
                    "$ref": "#/definitions/DatabaseSingle",
                    "description": "Deployment options for a single Realtime Database instance."
                },
                {
                    "description": "Deployment options for a list of Realtime Database instancs.",
                    "items": {
                        "anyOf": [
                            {
                                "additionalProperties": false,
                                "properties": {
                                    "instance": {
                                        "description": "The instance that this rules files is for.",
                                        "type": "string"
                                    },
                                    "postdeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran after this product is deployed."
                                    },
                                    "predeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran before this product is deployed."
                                    },
                                    "rules": {
                                        "description": "The rules files for this Realtime Database instance.",
                                        "type": "string"
                                    },
                                    "target": {
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "instance",
                                    "rules"
                                ],
                                "type": "object"
                            },
                            {
                                "additionalProperties": false,
                                "properties": {
                                    "instance": {
                                        "description": "The instance that this rules files is for.",
                                        "type": "string"
                                    },
                                    "postdeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran after this product is deployed."
                                    },
                                    "predeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran before this product is deployed."
                                    },
                                    "rules": {
                                        "description": "The rules files for this Realtime Database instance.",
                                        "type": "string"
                                    },
                                    "target": {
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "rules",
                                    "target"
                                ],
                                "type": "object"
                            }
                        ]
                    },
                    "type": "array"
                }
            ],
            "description": "The Realtime Database rules that should be deployed or emulated."
        },
        "dataconnect": {
            "anyOf": [
                {
                    "$ref": "#/definitions/DataConnectSingle",
                    "description": "A single Data Connect deployment configs"
                },
                {
                    "description": "A list of Data Connect deployment configs",
                    "items": {
                        "$ref": "#/definitions/DataConnectSingle"
                    },
                    "type": "array"
                }
            ],
            "description": "The Data Connect service(s) that should be deployed or emulated."
        },
        "emulators": {
            "additionalProperties": false,
            "description": "Hosts, ports, and configuration options for the Firebase Emulator suite.",
            "properties": {
                "apphosting": {
                    "additionalProperties": false,
                    "description": "Config for the App Hosting emulator",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        },
                        "rootDirectory": {
                            "description": "The root directory of your app. The start command will ran from this directory.",
                            "type": "string"
                        },
                        "startCommand": {
                            "description": "The command that will be run to start your app when emulating your App Hosting backend",
                            "type": "string"
                        },
                        "startCommandOverride": {
                            "type": "string"
                        }
                    },
                    "type": "object"
                },
                "auth": {
                    "additionalProperties": false,
                    "description": "Config for the Auth emulator",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "database": {
                    "additionalProperties": false,
                    "description": "Config for the Realtime Database emulator",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "dataconnect": {
                    "additionalProperties": false,
                    "description": "Config for the Data Connect emulator.",
                    "properties": {
                        "dataDir": {
                            "description": "The directory to persist emulator data to. If set, data will be saved between runs automatically.\nIf the --import flag is used, the current data will be overwritten by the imported data.",
                            "type": "string"
                        },
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        },
                        "postgresHost": {
                            "description": "Host for the Postgres database that backs the Data Connect emulator.",
                            "type": "string"
                        },
                        "postgresPort": {
                            "description": "Port for the Postgres database that backs the Data Connect emulator.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "eventarc": {
                    "additionalProperties": false,
                    "description": "Config for the EventArc emulator.",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "extensions": {
                    "description": "Placeholder - the Extensions emulator has no configuration options.",
                    "properties": {},
                    "type": "object"
                },
                "firestore": {
                    "additionalProperties": false,
                    "description": "Config for the Firestore emulator",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        },
                        "websocketPort": {
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "hosting": {
                    "additionalProperties": false,
                    "description": "Config for the Firebase Hosting emulator",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "hub": {
                    "additionalProperties": false,
                    "description": "Config for the emulator suite hub.",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "logging": {
                    "additionalProperties": false,
                    "description": "Config for the logging emulator.",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "pubsub": {
                    "additionalProperties": false,
                    "description": "Config for the Pub/Sub emulator",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "singleProjectMode": {
                    "description": "If true, the Emulator Suite will only allow a single project to be used at a time.",
                    "type": "boolean"
                },
                "storage": {
                    "additionalProperties": false,
                    "description": "Config for the Firebase Storage emulator",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "tasks": {
                    "additionalProperties": false,
                    "description": "Config for the Cloud Tasks emulator.",
                    "properties": {
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                },
                "ui": {
                    "additionalProperties": false,
                    "description": "Config for the Emulator UI.",
                    "properties": {
                        "enabled": {
                            "description": "If false, the Emulator UI will not be served.",
                            "type": "boolean"
                        },
                        "host": {
                            "description": "The host that this emulator will serve on.",
                            "type": "string"
                        },
                        "port": {
                            "description": "The port that this emulator will serve on.",
                            "type": "number"
                        }
                    },
                    "type": "object"
                }
            },
            "type": "object"
        },
        "extensions": {
            "$ref": "#/definitions/ExtensionsConfig",
            "description": "The Firebase Extension(s) that should be deployed or emulated."
        },
        "firestore": {
            "anyOf": [
                {
                    "$ref": "#/definitions/FirestoreSingle",
                    "description": "Deployment options for a single Firestore database."
                },
                {
                    "description": "Deployment options for a list of Firestore databases.",
                    "items": {
                        "anyOf": [
                            {
                                "additionalProperties": false,
                                "properties": {
                                    "database": {
                                        "description": "The ID of the Firestore database to deploy. Required when deploying multiple Firestore databases.",
                                        "type": "string"
                                    },
                                    "indexes": {
                                        "description": "Path to the firestore indexes file for this database",
                                        "type": "string"
                                    },
                                    "postdeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran after this product is deployed."
                                    },
                                    "predeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran before this product is deployed."
                                    },
                                    "rules": {
                                        "description": "Path to the firestore rules file for this database",
                                        "type": "string"
                                    },
                                    "target": {
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "target"
                                ],
                                "type": "object"
                            },
                            {
                                "additionalProperties": false,
                                "properties": {
                                    "database": {
                                        "description": "The ID of the Firestore database to deploy. Required when deploying multiple Firestore databases.",
                                        "type": "string"
                                    },
                                    "indexes": {
                                        "description": "Path to the firestore indexes file for this database",
                                        "type": "string"
                                    },
                                    "postdeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran after this product is deployed."
                                    },
                                    "predeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran before this product is deployed."
                                    },
                                    "rules": {
                                        "description": "Path to the firestore rules file for this database",
                                        "type": "string"
                                    },
                                    "target": {
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "database"
                                ],
                                "type": "object"
                            }
                        ]
                    },
                    "type": "array"
                }
            ],
            "description": "The Firestore rules and indexes that should be deployed or emulated."
        },
        "functions": {
            "anyOf": [
                {
                    "$ref": "#/definitions/FunctionConfig"
                },
                {
                    "items": {
                        "$ref": "#/definitions/FunctionConfig"
                    },
                    "type": "array"
                }
            ],
            "description": "The Cloud Functions for Firebase that should be deployed or emulated."
        },
        "hosting": {
            "anyOf": [
                {
                    "$ref": "#/definitions/HostingSingle"
                },
                {
                    "items": {
                        "anyOf": [
                            {
                                "additionalProperties": false,
                                "properties": {
                                    "appAssociation": {
                                        "enum": [
                                            "AUTO",
                                            "NONE"
                                        ],
                                        "type": "string"
                                    },
                                    "cleanUrls": {
                                        "type": "boolean"
                                    },
                                    "frameworksBackend": {
                                        "$ref": "#/definitions/FrameworksBackendOptions"
                                    },
                                    "headers": {
                                        "items": {
                                            "$ref": "#/definitions/HostingHeaders"
                                        },
                                        "type": "array"
                                    },
                                    "i18n": {
                                        "additionalProperties": false,
                                        "properties": {
                                            "root": {
                                                "type": "string"
                                            }
                                        },
                                        "required": [
                                            "root"
                                        ],
                                        "type": "object"
                                    },
                                    "ignore": {
                                        "items": {
                                            "type": "string"
                                        },
                                        "type": "array"
                                    },
                                    "postdeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran after this product is deployed."
                                    },
                                    "predeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran before this product is deployed."
                                    },
                                    "public": {
                                        "type": "string"
                                    },
                                    "redirects": {
                                        "items": {
                                            "$ref": "#/definitions/HostingRedirects"
                                        },
                                        "type": "array"
                                    },
                                    "rewrites": {
                                        "items": {
                                            "$ref": "#/definitions/HostingRewrites"
                                        },
                                        "type": "array"
                                    },
                                    "site": {
                                        "type": "string"
                                    },
                                    "source": {
                                        "type": "string"
                                    },
                                    "target": {
                                        "type": "string"
                                    },
                                    "trailingSlash": {
                                        "type": "boolean"
                                    }
                                },
                                "required": [
                                    "target"
                                ],
                                "type": "object"
                            },
                            {
                                "additionalProperties": false,
                                "properties": {
                                    "appAssociation": {
                                        "enum": [
                                            "AUTO",
                                            "NONE"
                                        ],
                                        "type": "string"
                                    },
                                    "cleanUrls": {
                                        "type": "boolean"
                                    },
                                    "frameworksBackend": {
                                        "$ref": "#/definitions/FrameworksBackendOptions"
                                    },
                                    "headers": {
                                        "items": {
                                            "$ref": "#/definitions/HostingHeaders"
                                        },
                                        "type": "array"
                                    },
                                    "i18n": {
                                        "additionalProperties": false,
                                        "properties": {
                                            "root": {
                                                "type": "string"
                                            }
                                        },
                                        "required": [
                                            "root"
                                        ],
                                        "type": "object"
                                    },
                                    "ignore": {
                                        "items": {
                                            "type": "string"
                                        },
                                        "type": "array"
                                    },
                                    "postdeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran after this product is deployed."
                                    },
                                    "predeploy": {
                                        "anyOf": [
                                            {
                                                "items": {
                                                    "type": "string"
                                                },
                                                "type": "array"
                                            },
                                            {
                                                "type": "string"
                                            }
                                        ],
                                        "description": "A script or list of scripts that will be ran before this product is deployed."
                                    },
                                    "public": {
                                        "type": "string"
                                    },
                                    "redirects": {
                                        "items": {
                                            "$ref": "#/definitions/HostingRedirects"
                                        },
                                        "type": "array"
                                    },
                                    "rewrites": {
                                        "items": {
                                            "$ref": "#/definitions/HostingRewrites"
                                        },
                                        "type": "array"
                                    },
                                    "site": {
                                        "type": "string"
                                    },
                                    "source": {
                                        "type": "string"
                                    },
                                    "target": {
                                        "type": "string"
                                    },
                                    "trailingSlash": {
                                        "type": "boolean"
                                    }
                                },
                                "required": [
                                    "site"
                                ],
                                "type": "object"
                            }
                        ]
                    },
                    "type": "array"
                }
            ],
            "description": "The Firebase Hosting site(s) that should be deployed or emulated."
        },
        "remoteconfig": {
            "$ref": "#/definitions/RemoteConfigConfig",
            "description": "The Remote Config template(s) used by this project."
        },
        "storage": {
            "anyOf": [
                {
                    "$ref": "#/definitions/StorageSingle",
                    "description": "Deployment options for a single Firebase storage bucket."
                },
                {
                    "description": "Deployment options for multiple Firebase storage buckets.",
                    "items": {
                        "additionalProperties": false,
                        "properties": {
                            "bucket": {
                                "description": "The Firebase Storage bucket that this config is for.",
                                "type": "string"
                            },
                            "postdeploy": {
                                "anyOf": [
                                    {
                                        "items": {
                                            "type": "string"
                                        },
                                        "type": "array"
                                    },
                                    {
                                        "type": "string"
                                    }
                                ],
                                "description": "A script or list of scripts that will be ran after this product is deployed."
                            },
                            "predeploy": {
                                "anyOf": [
                                    {
                                        "items": {
                                            "type": "string"
                                        },
                                        "type": "array"
                                    },
                                    {
                                        "type": "string"
                                    }
                                ],
                                "description": "A script or list of scripts that will be ran before this product is deployed."
                            },
                            "rules": {
                                "description": "Path to the rules files for this Firebase Storage bucket.",
                                "type": "string"
                            },
                            "target": {
                                "type": "string"
                            }
                        },
                        "required": [
                            "bucket",
                            "rules"
                        ],
                        "type": "object"
                    },
                    "type": "array"
                }
            ],
            "description": "The Firebase Storage rules that should be deployed or emulated."
        }
    },
    "type": "object"
}
```


