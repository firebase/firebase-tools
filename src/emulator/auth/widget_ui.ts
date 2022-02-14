// Note: For browser compatibility, please avoid ES6 and newer browser
// features as much as possible in the page below.

const SCRIPT = `
function assert(condition, error) {
  if (!condition) {
    if (!(error instanceof Error)) {
      error = new Error('Auth Emulator Internal Error: ' + error);
    }
    // Show error with great visibility AND stops further user interactions.
    document.body.textContent = error.stack || error.message;
    document.body.style = 'color:red;white-space:pre';
    throw error; // Halts current script and prints error to console.
  }
}

// TODO: Support older browsers where URLSearchParams is not available.
var query = new URLSearchParams(location.search);
var internalError = query.get('error');
assert(!internalError, internalError);

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
var isSamlProvider = !!providerId.match(/^saml\./);
assert(
  appName || clientId || firebaseAppId || appIdentifier,
  'Missing one of appName / clientId / appId / apn / ibi query params.'
);

// Warn the developer of a few flows only available in Auth Emulator.
if ((providerId === 'facebook.com' && appIdentifier) || (providerId === 'apple.com' && ibi)) {
  var providerName = (providerId === 'facebook.com') ? 'Facebook' : 'Apple';
  var productionMethod = providerName + (apn ? ' Android SDK' : ' iOS SDK');
  var warningEl = document.querySelector('.js-signin-warning');
  warningEl.querySelector('.content').textContent =
    'Sign-in with ' + providerName + ' via generic IDP is only supported in the Auth Emulator; ' +
    'remember to switch to ' + productionMethod + ' for production Firebase projects.';
  warningEl.style.display = 'flex';
}

function saveAuthEvent(authEvent) {
  if (/popup/i.test(authType)) {
    sendAuthEventViaIframeRelay(authEvent, function (err) {
      assert(!err, err);
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
      assert(false, 'This feature is not implemented in Auth Emulator yet. Please use signInWithCredential for now.');
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
      // Try/catch is necessary because without it, the code will crash the first time one of the frames does not have
      // the same origin (from the iframeWin.location.search) and the loop will not reach the other frames.
      try {
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
      } catch (e) {
        // The frame does not have the same origin
      }
    }
  }
  if (!sent) {
    return cb('No matching frame');
  }
  return cb();
}

function redirectToAndroid(authEvent) {
  // This is shown when no app handles the link and displays an error.
  var fallbackUrl = window.location.href + '&error=App+not+found+for+intent';

  var link = 'intent://firebase.auth/#Intent;scheme=genericidp;' +
      'package=' + apn + ';' +
      'S.authType=' + authEvent.type + ';';
  if (authEvent.eventId) {
    link += 'S.eventId=' + authEvent.eventId + ';';
  }
  link += 'S.link=' + encodeURIComponent(authEvent.urlResponse) + ';';
  link += 'B.encryptionEnabled=false;';
  link += 'S.browser_fallback_url=' + encodeURIComponent(fallbackUrl) + ';';

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

var formattedProviderId = providerId[0].toUpperCase() + providerId.substring(1);
document.querySelectorAll('.js-provider-id').forEach(function(e) {
  e.textContent = formattedProviderId;
});

var reuseAccountEls = document.querySelectorAll('.js-reuse-account');
if (reuseAccountEls.length) {
  [].forEach.call(reuseAccountEls, function (el) {
    var urlEncodedIdToken = el.dataset.idToken;
    const decoded = JSON.parse(decodeURIComponent(urlEncodedIdToken));
    el.addEventListener('click', function (e) {
      e.preventDefault();
      finishWithUser(urlEncodedIdToken, decoded.email);
    });
  });
} else {
  document.querySelector('.js-accounts-help-text').textContent = "No " + formattedProviderId + " accounts exist in the Auth Emulator.";
}

function finishWithUser(urlEncodedIdToken, email) {
  // Use widget URL, but replace all query parameters (no apiKey etc.).
  var url = window.location.href.split('?')[0];
  // Avoid URLSearchParams for browser compatibility.
  url += '?providerId=' + encodeURIComponent(providerId);
  url += '&id_token=' + urlEncodedIdToken;

  // Save reasonable defaults for SAML providers
  if (isSamlProvider) {
    url += '&SAMLResponse=' + encodeURIComponent(JSON.stringify({
      assertion: {
        subject: {
          nameId: email,
        },
      },
    }));
  }

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
  e.preventDefault();
  var valid = validateForm();
  if (valid) {
    var email = document.getElementById('email-input').value;
    var displayName = document.getElementById('display-name-input').value;
    var screenName = document.getElementById('screen-name-input').value;
    var photoUrl = document.getElementById('profile-photo-input').value;
    var claims = {};

    if (email) claims.email = email;
    if (displayName) claims.displayName = displayName;
    if (screenName) claims.screenName = screenName;
    if (photoUrl) claims.photoUrl = photoUrl;

    finishWithUser(createFakeClaims(claims), claims.email);
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
    'raccoon',
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
  emailInput.value = givenName + '.' + familyName + '.' + randomNumber + '@example.com';
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

:root {
  --mdc-theme-text-secondary-on-background: rgba(0,0,0,.56);
}

body {
  font-family: "Roboto", sans-serif;
  margin: 0;
  padding: 0;
  width: 100%;
}

p {
  margin-block-end: 0em;
  margin-block-start: 0em;
}

li {
  padding: 8px 16px;
  list-style-type: none;
}

ul {
  padding-inline-start: 0;
}

button {
  text-transform: none !important;
  letter-spacing: 0 !important;
}

#title {
  align-items: center;
  display: flex;
  flex-direction: row;
  font-size: 24px;
  font-weight: 500;
  margin-bottom: 16px;
  margin-top: 32px;
}

#title > span {
  flex: 1;
}

#title > button {
  color: #858585;
}

.subtitle {
 color: var(--mdc-theme-text-secondary-on-background);
 font-size: 14px;
 line-height: 20px;
 margin-block-end: 0em;
 margin-block-start: 0em;
}

#content {
  box-sizing: border-box;
  margin: 16px auto;
  max-width: 515px;
  min-width: 300px;
}

.content-wrapper, .mdc-list--avatar-list .mdc-list-item {
  padding: 0 24px;
}

.mdc-list .mdc-list-item__graphic {
  align-items: center;
  background-color: #c5c5c5;
  background-size: contain;
  border-radius: 50%;
  color: #fff;
  fill: currentColor;
  flex-shrink: 0;
  height: 36px;
  justify-content: center;
  margin-left: 0;
  margin-right: 16px;
  width: 36px;
}

#add-account-button {
  height: 56px !important;
}

.callout {
  background: #e5eaf0;
  color: #476282;
  display: flex;
  flex-direction: row;
  padding: 12px 24px;
}

.callout-warning {
  background: #fff3e0;
  color: #bf360c;
}

.callout .content {
  flex: 1;
  align-self: center;
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
  width: 100%;
}

.form-label {
  color: rgba(0,0,0,.54);
  display: block;
  font-size: 12px;
  margin: 0 0 4px 1px;
}

.custom-label {
  color: rgba(0,0,0,.38);
  display: inline-block;
  margin-left: 4px;
  transform: translateY(50%);
}

.error-info {
  color: #C62828;
  display: block;
  font-size: 12px;
  padding-top: 4px;
}

#main-action {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-top: 15px;
  width: 100%;
}

#back-button {
  left: -8px;
  position: relative;
}

#add-user {
  display: none;
}

.fallback-secondary-text {
  color: var(--mdc-theme-text-secondary-on-background);
}

`;

export const PROVIDERS_LIST_PLACEHOLDER = "__PROVIDERS__";

export const WIDGET_UI = `
<!DOCTYPE html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Auth Emulator IDP Login Widget</title>
<link href="https://unpkg.com/material-components-web@10/dist/material-components-web.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap" rel="stylesheet">
<style>${STYLE}</style>
<div id="content">
  <div class="content-wrapper">
    <div id="title">
      <span>Sign-in with <span class="js-provider-id provider-name">Provider</span></span>
    </div>
  </div>
  <div id="accounts-list">
    <div class="content-wrapper">
      <div class="callout callout-warning vs js-signin-warning" style="display:none">
        <i class="material-icons">error</i>
        <div class="content"></div>
      </div>
      <p class="subtitle js-accounts-help-text">Please select an existing account in the Auth Emulator or add a new one:</p>
    </div>
    <ul class="mdc-list list mdc-list--two-line mdc-list--avatar-list">
      ${PROVIDERS_LIST_PLACEHOLDER}
      <li id="add-account-button" class="js-new-account mdc-list-item">
        <button class="mdc-button mdc-button--outlined">
          <div class="mdc-button__ripple"></div>
            <i class="material-icons mdc-button__icon" aria-hidden="true">add</i>
            <span class="mdc-button__label">Add new account</span>
          </button>
      </li>
    </ul>
  </div>
  <div id="add-user">
    <div class="content-wrapper" id="form-content">
      <div class="callout vs">
        <i class="material-icons">info</i>
        <div class="content">
          Custom claims can be added after an account is created
        </div>
      </div>
      <button id="autogen-button" class="vs mdc-button mdc-button--outlined" type="button">
        <div class="mdc-button__ripple"></div>
        <span class="mdc-button__label">Auto-generate user information</span>
      </button>
      <form id="main-form">
        <span class="form-label">Email</span>
        <label class="mdc-text-field mdc-text-field--outlined">
          <input id="email-input" type="text"
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
              Sign in with <span class="js-provider-id provider-name">Provider</span>
            </span>
          </button>
        </div>
      </form>
    </div>
  </div>
</div>
<script src="https://unpkg.com/material-components-web@10/dist/material-components-web.min.js"></script>
<script>${SCRIPT}</script>
`;
