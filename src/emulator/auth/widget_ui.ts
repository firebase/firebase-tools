// Note: For browser compatibility, please avoid ES6 and newer browser
// features as much as possible in the page below.

const SCRIPT = `
// TODO: Support older browsers where URLSearchParams is not available.
var query = new URLSearchParams(location.search);
var apiKey = query.get('apiKey');
var appName = query.get('appName');
var authType = query.get('authType');
var providerId = query.get('providerId');
var redirectUrl = query.get('redirectUrl');
var scopes = query.get('scopes');
var eventId = query.get('eventId');
var storageKey = apiKey + ':' + appName;

var clientId = query.get('clientId');
var firebaseAppId = query.get('appId');
var apn = query.get('apn');
var ibi = query.get('ibi');
var appIdentifier = apn || ibi;
if (!appName && !clientId && !firebaseAppId && !appIdentifier) {
  alert('Auth Emulator Internal Error: Missing one of appName / clientId / appId / apn / ibi query params.');
}

function saveAuthEvent(authEvent) {
  if (/popup/i.test(authType)) {
    sendAuthEventViaIframeRelay(authEvent, function (err) {
      if (err) {
        return alert('Auth Emulator Internal Error: ' + err);
      }
    });
  } else {
    if (apn) {
      redirectToAndroid(authEvent);
    } else if (ibi) {
      redirectToIos(authEvent);
    } else if (redirectUrl) {
      saveAuthEventToStorage(authEvent);
      window.location = redirectUrl;
    } else {
      return alert('This feature is not implemented in Auth Emulator yet. Please use signInWithCredential for now.');
    }
  }
}

function saveAuthEventToStorage(authEvent) {
  sessionStorage['firebase:redirectEvent:' + storageKey] =
    JSON.stringify(authEvent);
}

function sendAuthEventViaIframeRelay(authEvent, cb) {
  var sent = false;
  if (window.opener) {
    for (var i = 0; i < window.opener.frames.length; i++) {
      var iframeWin = window.opener.frames[i];
      var query = new URLSearchParams(iframeWin.location.search);
      if (query.get('apiKey') === apiKey && query.get('appName') === appName) {
        iframeWin.postMessage({
          data: {authEvent: authEvent, storageKey: storageKey},
          eventId: Math.floor(Math.random() * Math.pow(10, 20)).toString(),
          eventType: "sendAuthEvent",
        }, '*');
        sent = true;
      }
    }
  }
  if (!sent) {
    return cb('No matching frame');
  }
  return cb();
}

function redirectToAndroid(authEvent) {
  var link = 'intent://firebase.auth/#Intent;scheme=genericidp;' +
      'package=' + apn + ';' +
      'S.authType=' + authEvent.type + ';';
  if (authEvent.eventId) {
    link += 'S.eventId=' + authEvent.eventId + ';';
  }
  link += 'S.link=' + encodeURIComponent(authEvent.urlResponse) + ';';
  link += 'end;';

  window.location.replace(link);
}

function redirectToIos(authEvent) {
  // This URL format is based on production widget and known to work with the
  // iOS SDK. It does not matter that /__/auth/callback is not an actual page
  // served by the Auth Emulator -- only the format and query params matter.
  var url = window.location.protocol + '//' + window.location.host +
      '/__/auth/callback?authType=' + encodeURIComponent(authEvent.type) +
      '&link=' + encodeURIComponent(authEvent.urlResponse);
  if (authEvent.eventId) {
    url += '&eventId=' + authEvent.eventId;
  }
  var scheme;
  if (clientId) {
    scheme = clientId.split('.').reverse().join('.');
  } else if (firebaseAppId) {
    scheme = 'app-' + firebaseAppId.replace(/:/g, '-');
  } else {
    scheme = appIdentifier;
  }
  var deepLink = scheme + '://' +
    (clientId || firebaseAppId ? 'firebaseauth' : 'google') + '/link';
  deepLink += '?deep_link_id=' + encodeURIComponent(url);

  window.location.replace(deepLink);
}


// DOM logic

document.querySelectorAll('.js-provider-id').forEach(function(e) {e.textContent = providerId});
var reuseAccountEls = document.querySelectorAll('.js-reuse-account');
[].forEach.call(reuseAccountEls, function (el) {
  var urlEncodedIdToken = el.dataset.idToken;
  el.addEventListener('click', function (e) {
    e.preventDefault();
    finishWithUser(urlEncodedIdToken);
  });
});

function finishWithUser(urlEncodedIdToken) {
  // Use widget URL, but replace all query parameters (no apiKey etc.).
  var url = window.location.href.split('?')[0];
  // Avoid URLSearchParams for browser compatibility.
  url += '?providerId=' + encodeURIComponent(providerId);
  url += '&id_token=' + urlEncodedIdToken;
  saveAuthEvent({
    type: authType,
    eventId: eventId,
    urlResponse: url,
    sessionId: "ValueNotUsedByAuthEmulator",
    postBody: "",
    tenantId: null,
    error: null,
  });
}

document.querySelector('.js-new-account').addEventListener('click', function (e) {
  e.preventDefault();
  toggleForm(true);
});

var inputs = document.querySelectorAll('.mdc-text-field');
// Set up styling and reactivity for inputs
inputs.forEach(function (input) {
  input.querySelector('input').addEventListener('input', function(e) {
    var display = 'none';
    if (!e.target.value) display = 'block';
    input.querySelector('.custom-label').style.display = display;
    validateForm();
  });
  window.mdc && mdc.textField.MDCTextField.attachTo(input);
});

document.getElementById('autogen-button').addEventListener('click', function() {
  runAutogen();
});

// Handle form validation and submission
document.getElementById('main-form').addEventListener('submit', function(e) {
  var valid = validateForm();
  if (!valid) {
    e.preventDefault();
  } else {
    // Get rid of this in the actual thing
    e.preventDefault();
    var emailInput = document.getElementById('email-input');
    var displayInput = document.getElementById('display-name-input');
    var screenInput = document.getElementById('screen-name-input');
    var photoInput = document.getElementById('profile-photo-input');
    finishWithUser(createFakeClaims({
      displayName: displayInput.value,
      screenName: screenInput.value,
      email: emailInput.value,
      photoUrl: photoInput.value
    }));
  }
});

document.getElementById('back-button').addEventListener('click', function() {
  toggleForm(false);
});

function createFakeClaims(info) {
  return encodeURIComponent(JSON.stringify({
    sub: randomProviderRawId(),
    iss: "",
    aud: "",
    exp: 0,
    iat: 0,
    name: info.displayName,
    screen_name: info.screenName,
    email: info.email,
    email_verified: true, // TODO: Shall we allow changing this?
    picture: info.photoUrl,
  }));
}

function randomProviderRawId() {
  var str = '';
  for (var i = 0; i < 40; i++) {
    str += Math.floor(Math.random() * 10).toString();
  }

  return str;
}


// For now form validation only checks the email field.
function validateForm() {
  var emailInput = document.getElementById('email-input');
  var valid = true;
  var value = emailInput.value;

  if (!value) {
    valid = false;
    emailErrorMessage('Email required');
  } else if (value.indexOf('@') < 0) {
    valid = false;
    emailErrorMessage('Missing "@"');
  } else {
    emailErrorMessage('');
  }

  document.querySelector('#sign-in').disabled = !valid;

  return valid;
}

// Generates random info for user creation
function runAutogen() {
  var emailInput = document.getElementById('email-input');
  var displayInput = document.getElementById('display-name-input');
  var screenInput = document.getElementById('screen-name-input');

  var nameOptions = [
    'racoon',
    'olive',
    'orange',
    'chicken',
    'mountain',
    'peach',
    'panda',
    'grass',
    'algae',
    'otter'
  ];

  var randomNumber = Math.floor(Math.random() * 1000);
  var givenName = nameOptions[Math.floor(Math.random() * nameOptions.length)];
  var familyName = nameOptions[Math.floor(Math.random() * nameOptions.length)];
  emailInput.value = givenName + '.' + familyName + '.' + randomNumber + '@test.com';
  displayInput.value = capitalize(givenName) + ' ' + capitalize(familyName);
  screenInput.value = familyName + '_' + givenName;

  emailInput.dispatchEvent(new Event('input'));
  displayInput.dispatchEvent(new Event('input'));
  screenInput.dispatchEvent(new Event('input'));
}

function emailErrorMessage(value) {
  document.getElementById('email-error').innerText = value;
}

function capitalize(a) {
  return a.charAt(0).toUpperCase() + a.slice(1);
}

function toggleForm(showForm) {
  document.getElementById('add-user').style.display =
      showForm ? 'block' : 'none';
  document.getElementById('accounts-list').style.display =
      showForm ? 'none' : 'block';
}
`;

const STYLE = `
#title {
  align-items: center;
  display: flex;
  flex-direction: row;
  font-size: 24px;
  margin-bottom: 16px;
}

#title > span {
  flex: 1;
}

#title > button {
  color: #858585;
}

body {
  font-family: "Roboto", sans-serif;
  margin: 0;
  padding: 0;
  width: 100%;
}

#content {
  box-sizing: border-box;
  padding: 12px;
  width: 500px;
}

button {
  text-transform: none !important;
}

.callout {
  align-items: center;
  background: #e5eaf0;
  color: #476282;
  display: flex;
  flex-direction: row;
  padding: 12px 24px;
}

.callout .content {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  margin-left: 8px;
}

/* Vertical Spaced */
.vs {
  margin-bottom: 16px;
}

.mdc-text-field {
  height: 40px !important;
  width: 340px;
}

.form-label {
  color: #858585;
  display: block;
  font-size: 12px;
  margin: 0 0 4px 1px;
}

.custom-label {
  color: rgba(0,0,0,.6);
  display: inline-block;
  margin-left: 4px;
  transform: translateY(50%);
}

.error-info {
  color: darkred;
  display: block;
  font-size: 12px;
  padding-left: 1px;
}

#main-action {
  display: flex;
  flex-direction: row;
  margin-top: 15px;
  width: 100%;
}

#main-action > button {
  margin-right: 8px;
}

#add-user {
  display: none;
}
`;

export const PROVIDERS_LIST_PLACEHOLDER = "__PROVIDERS__";

export const WIDGET_UI = `
<!DOCTYPE html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auth Emulator IDP Login Widget</title>
<link href="https://unpkg.com/material-components-web@latest/dist/material-components-web.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLE}</style>
<div id="content">
  <div id="title">
    <span>Sign-in with <span class="js-provider-id">Provider</span></span>
  </div>
  <div id="accounts-list">
    <ul>
    ${PROVIDERS_LIST_PLACEHOLDER}
    <li class="js-new-account"><a href="#">Add Another Account</a></li>
    </ul>
  </div>
  <div id="add-user">
    <div id="form-content">
      <div class="callout vs">
        <i class="material-icons">info</i>
        <div class="content">
          Custom claims can be added after an account is created
        </div>
      </div>
      <button id="autogen-button" class="vs mdc-button mdc-button--outlined" type="button">
        <div class="mdc-button__ripple"></div>
        <span class="mdc-button__label">Auto Generate User Information</span>
      </button>
      <form id="main-form">
        <span class="form-label">Email</span>
        <label class="mdc-text-field mdc-text-field--outlined">
          <input required id="email-input" type="text"
              class="mdc-text-field__input test" aria-labelledby="my-label-id">
          <span class="mdc-notched-outline">
            <span class="mdc-notched-outline__leading"></span>
            <span class="mdc-notched-outline__notch">
            <span class="custom-label" id="email-label">Email</span>
            </span>
            <span class="mdc-notched-outline__trailing"></span>
          </span>
        </label>
        <span class="error-info vs" id="email-error"></span>

        <span class="form-label">Display name (optional)</span>
        <label class="mdc-text-field mdc-text-field--outlined vs">
          <input id="display-name-input" type="text"
              class="mdc-text-field__input test" aria-labelledby="my-label-id">
          <span class="mdc-notched-outline">
            <span class="mdc-notched-outline__leading"></span>
            <span class="mdc-notched-outline__notch">
            <span class="custom-label" id="email-label">Display name</span>
            </span>
            <span class="mdc-notched-outline__trailing"></span>
          </span>
        </label>

        <span class="form-label">Screen name (optional)</span>
        <label class="mdc-text-field mdc-text-field--outlined vs">
          <input id="screen-name-input" type="text"
              class="mdc-text-field__input test" aria-labelledby="my-label-id">
          <span class="mdc-notched-outline">
            <span class="mdc-notched-outline__leading"></span>
            <span class="mdc-notched-outline__notch">
            <span class="custom-label" id="email-label">Screen name</span>
            </span>
            <span class="mdc-notched-outline__trailing"></span>
          </span>
        </label>

        <span class="form-label">Profile photo URL (optional)</span>
        <label class="mdc-text-field mdc-text-field--outlined vs">
          <input id="profile-photo-input" type="text"
              class="mdc-text-field__input test" aria-labelledby="my-label-id">
          <span class="mdc-notched-outline">
            <span class="mdc-notched-outline__leading"></span>
            <span class="mdc-notched-outline__notch">
            <span class="custom-label" id="email-label">Profile photo URL</span>
            </span>
            <span class="mdc-notched-outline__trailing"></span>
          </span>
        </label>

        <div id="main-action" class="vs">
          <button class="mdc-button" id="back-button" type="button">
            <div class="mdc-button__ripple"></div>
            <i class="material-icons mdc-button__icon" aria-hidden="true"
              >arrow_back</i
            >
            <span class="mdc-button__label">Back</span>
          </button>
          <button class="mdc-button mdc-button--raised" id="sign-in" type="submit">
            <span class="mdc-button__label">
              Sign in with <span class="js-provider-id">Provider</span>
            </span>
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<script src="https://unpkg.com/material-components-web@latest/dist/material-components-web.min.js"></script>
<script>${SCRIPT}</script>
`;
