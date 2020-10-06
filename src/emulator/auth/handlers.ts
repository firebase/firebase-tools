import { URL } from "url";
import * as express from "express";
import { IdpJwtPayload, resetPassword, setAccountInfoImpl } from "./operations";
import { ProjectState, ProviderUserInfo } from "./state";
import { BadRequestError, NotImplementedError } from "./errors";

/**
 * Register routes for emulator-only handlers.
 * @param app the main express app
 * @param getProjectStateByApiKey function for resolving project by API key
 */
export function registerHandlers(
  app: express.Express,
  getProjectStateByApiKey: (apiKey: string) => ProjectState
): void {
  app.get(`/emulator/action`, (req, res) => {
    const { mode, oobCode, continueUrl, apiKey } = req.query as Record<string, string | undefined>;

    if (!apiKey) {
      return res.status(400).json({
        authEmulator: {
          error: "missing apiKey query parameter",
          instructions: `Please modify the URL to specify an apiKey, such as ...&apiKey=YOUR_API_KEY`,
        },
      });
    }
    if (!oobCode) {
      return res.status(400).json({
        authEmulator: {
          error: "missing oobCode query parameter",
          instructions: `Please modify the URL to specify an oobCode, such as ...&oobCode=YOUR_OOB_CODE`,
        },
      });
    }
    const state = getProjectStateByApiKey(apiKey);

    switch (mode) {
      case "resetPassword": {
        const oob = state.validateOobCode(oobCode);
        if (oob?.requestType !== "PASSWORD_RESET") {
          return res.status(400).json({
            authEmulator: {
              error: `Your request to reset your password has expired or the link has already been used.`,
              instructions: `Try resetting your password again.`,
            },
          });
        }
        if (!req.query.newPassword) {
          return res.status(400).json({
            authEmulator: {
              error: "missing newPassword query parameter",
              instructions: `To reset the password for ${oob.email}, send an HTTP GET request to the following URL.`,
              instructions2: "You may use a web browser or any HTTP client, such as curl.",
              urlTemplate: `${oob.oobLink}&newPassword=NEW_PASSWORD_HERE`,
            },
          });
        } else if (req.query.newPassword === "NEW_PASSWORD_HERE") {
          return res.status(400).json({
            authEmulator: {
              error: "newPassword must be something other than 'NEW_PASSWORD_HERE'",
              instructions: "The string 'NEW_PASSWORD_HERE' is just a placeholder.",
              instructions2: "Please change the URL to specify a new password instead.",
              urlTemplate: `${oob.oobLink}&newPassword=NEW_PASSWORD_HERE`,
            },
          });
        }
        const { email } = resetPassword(state, {
          oobCode,
          newPassword: req.query.newPassword as string,
        });

        if (continueUrl) {
          return res.redirect(303, continueUrl);
        } else {
          return res.status(200).json({
            authEmulator: { success: `The password has been successfully updated.`, email },
          });
        }
      }
      case "verifyEmail": {
        try {
          const { email } = setAccountInfoImpl(state, { oobCode });
          if (continueUrl) {
            return res.redirect(303, continueUrl);
          } else {
            return res.status(200).json({
              authEmulator: { success: `The email has been successfully verified.`, email },
            });
          }
        } catch (e) {
          if (
            e instanceof NotImplementedError ||
            (e instanceof BadRequestError && e.message === "INVALID_OOB_CODE")
          ) {
            return res.status(400).json({
              authEmulator: {
                error: `Your request to verify your email has expired or the link has already been used.`,
                instructions: `Try verifying your email again.`,
              },
            });
          } else {
            throw e;
          }
        }
      }
      case "signIn": {
        if (!continueUrl) {
          return res.status(400).json({
            authEmulator: {
              error: "Missing continueUrl query parameter",
              instructions: `To sign in, append &continueUrl=YOUR_APP_URL to the link.`,
            },
          });
        }
        const redirectTo = new URL(continueUrl);
        for (const name of Object.keys(req.query)) {
          if (name !== "continueUrl") {
            const query = req.query[name];
            if (typeof query === "string") {
              redirectTo.searchParams.set(name, query);
            }
          }
        }
        return res.redirect(303, redirectTo.toString());
      }
      default:
        return res.status(400).json({ authEmulator: { error: "Invalid mode" } });
    }
  });

  app.get(`/emulator/auth/handler`, (req, res) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    const apiKey = req.query.apiKey as string | undefined;
    const providerId = req.query.providerId as string | undefined;
    if (!apiKey || !providerId) {
      return res.status(400).json({
        authEmulator: {
          error: "missing apiKey or providerId query parameters",
        },
      });
    }
    const state = getProjectStateByApiKey(apiKey);
    const providerInfos = state.listProviderInfosByProviderId(providerId);

    // Note: For browser compatibility, please avoid ES6 and newer browser
    //  features as much as possible in the page below.
    res.end(
`<!DOCTYPE html>
  <head>
    <meta charset="utf-8">
    <title>Auth Emulator IDP Login Widget</title>
    <link href="https://unpkg.com/material-components-web@latest/dist/material-components-web.min.css" rel="stylesheet">
    <script src="https://unpkg.com/material-components-web@latest/dist/material-components-web.min.js"></script>
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons"
      rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap" rel="stylesheet"></head>
    <style>
      :root {
        --mdc-theme-text-secondary-on-background: rgba(0,0,0,.56);
      }

      body {
        font-family: "Roboto", "Helvetica", sans-serif;
        margin: 0;
      }

      .content-wrapper {
        padding: 0 16px;
      }

      .title {
        font-weight: 500;
        margin-top: 32px;
      }

      p {
        margin-block-end: 0em;
        margin-block-start: 0em;
      }

      button {
        letter-spacing: 0 !important;
        text-transform: none !important;  
      }

      .subtitle {
        color: var(--mdc-theme-text-secondary-on-background);
        font-size: 14px;
        line-height: 20px;
      }

      .disclaimer {
        align-items: center;
        color: var(--mdc-theme-text-secondary-on-background);
        display: flex;
        flex-direction: row;
      }

      .disclaimer .content {
        margin: 8px;
        flex: 1;
        font-size: 14px;
        font-style: italic;
      }

      .add-account {
        height: 56px !important;
      }

      .mdc-list--avatar-list .mdc-list-item__graphic {
        border-radius: 50%;
        height: 36px;
        margin-left: 0;
        margin-right: 16px;
        width: 36px;
      }

      .mdc-list .mdc-list-item__graphic {
        display: -ms-inline-flexbox;
        display: inline-flex;
      }

      .mdc-list--avatar-list .mdc-list-item__graphic {
        background-color: rgba(0,0,0,.3);
        color: #fff;
      }

      .mdc-list-item__graphic {
        align-items: center;
        color: background-color: rgba(0,0,0,.3);
        fill: currentColor;
        flex-shrink: 0;
        height: 24px;
        justify-content: center;
        margin-left: 0;
        margin-right: 32px;
        width: 24px;
        -ms-flex-negative: 0;
        -ms-flex-align: center;
        -ms-flex-pack: center;
      }

      .profile-photo {
        background-size: contain;
      }

      /*Fallbacks*/

      .fallback-secondary-text {
        color: var(--mdc-theme-text-secondary-on-background);
      }

      li {
        padding: 8px 16px;
        list-style-type: none;
      }

      ul {
        padding-inline-start: 0;
      }
      </style>
    </head>
    <body>
      <div class="content-wrapper">
        <h1 class="mdc-typography--headline5 title">Sign-in with <span class="js-provider-id">Provider</span></h1>
        <p class="subtitle">Please select an existing account in the Auth Emulator or add a new one:</p>
      </div>
      <ul class="mdc-list list mdc-list--two-line mdc-list--avatar-list">
      ${providerInfos
        .map(
          (info) => `<li class="js-reuse-account mdc-list-item mdc-ripple-upgraded" tabindex="0" data-id-token="${encodeURIComponent(
            createFakeClaims(info)
          )}">
            <span class="mdc-list-item__ripple"></span>
            ${info.profile ? `
              <span class="mdc-list-item__graphic profile-photo" style="background-image: url('${info.profile}')"></span>`
              :`
              <span class="mdc-list-item__graphic material-icons" aria-hidden=true>person</span>
              </div>`
            }
            <span class="mdc-list-item__text"><span class="mdc-list-item__primary-text">${info.displayName}</span>
            <span class="mdc-list-item__secondary-text fallback-secondary-text">${info.email}</span> 
        </li>`
        )

        .join("\n")}
        <li class="js-new-account mdc-list-item add-account">
          <button class="mdc-button mdc-button--outlined">
            <div class="mdc-button__ripple"></div>
            <i class="material-icons mdc-button__icon" aria-hidden="true">add</i>
            <span class="mdc-button__label">Add new account</span>
          </button>
        </li>
      </ul>
      <div class="content-wrapper">
        <div class="disclaimer">
          <i class="material-icons">info</i>
          <div class="content">This page is a work in progress and is subject to change.</div>
        </div>
      </div>
    </body>
  <script>
  // TODO: Support older browsers where URLSearchParams is not available.
  var query = new URLSearchParams(location.search);
  var apiKey = query.get('apiKey');
  var appName = query.get('appName');
  var authType = query.get('authType');
  var providerId = query.get('providerId');

  var redirectUrl = query.get('redirectUrl');
  var scopes = query.get('scopes');
  var eventId = query.get('eventId');
  if (!apiKey || !appName || !authType || !providerId) {
    alert('Auth Emulator Internal Error: Missing query params apiKey / appName / authType / providerId.');
  }
  var storageKey = apiKey + ':' + appName;

  function saveAuthEvent(authEvent) {
    if (/popup/i.test(authType)) {
      sendAuthEventViaIframeRelay(authEvent, function (err) {
        if (err) {
          return alert('Auth Emulator Internal Error: ' + err);
        }
      });
    } else {
      saveAuthEventToStorage(authEvent);
      if (redirectUrl) {
        window.location = redirectUrl;
      } else {
        // TODO
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

  // DOM logic

  document.querySelector('.js-provider-id').textContent = providerId;
  var reuseAccountEls = document.querySelectorAll('.js-reuse-account');
  [].forEach.call(reuseAccountEls, function (el) {
    var urlEncodedIdToken = el.dataset.idToken;
    el.addEventListener('click', function (e) {
      e.preventDefault();
      // Use widget URL, but replace all query parameters (no apiKey etc.).
      let url = window.location.href.split('?')[0];
      // Avoid URLSearchParams for browser compatibility.
      url += '?providerId=' + encodeURIComponent(providerId);
      url += '&id_token=' + urlEncodedIdToken;
      saveAuthEvent({
        type: authType,
        eventId: eventId,
        urlResponse: url,
        sessionId: "ValueNotUsedByAuthEmulator",
        postBody: null,
        tenantId: null,
        error: null,
      });
    });
  });
  document.querySelector('.js-new-account').addEventListener('click', function (e) {
    e.preventDefault();
    return alert('This feature is not implemented in Auth Emulator yet. Please use signInWithCredential for now.');
  });
</script>
`
    );
  });

  app.get(`/emulator/auth/iframe`, (req, res) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    // Note: For browser compatibility, please avoid ES6 and newer browser
    // features as much as possible in the page below.
    res.end(
      `<!DOCTYPE html>
<meta charset="utf-8">
<title>Auth Emulator Helper Iframe</title>
<script>
  // TODO: Support older browsers where URLSearchParams is not available.
  var query = new URLSearchParams(location.search);
  var apiKey = query.get('apiKey');
  var appName = query.get('appName');
  if (!apiKey || !appName) {
    alert('Auth Emulator Internal Error: Missing query params apiKey or appName for iframe.');
  }
  var storageKey = apiKey + ':' + appName;

  var parentContainer = null;

  window.addEventListener('message', function (e) {
    if (typeof e.data === 'object' && e.data.eventType === 'sendAuthEvent') {
      if (!e.data.data.storageKey === storageKey) {
        return alert('Auth Emulator Internal Error: Received request with mismatching storageKey');
      }
      var authEvent = e.data.data.authEvent;
      if (parentContainer) {
        sendAuthEvent(parentContainer, authEvent);
      } else {
        // Store it first, and initFrameMessaging() below will pick it up.
        sessionStorage['firebase:redirectEvent:' + storageKey] =
            JSON.stringify(authEvent);
      }
    }
  });

  function initFrameMessaging() {
    parentContainer = gapi.iframes.getContext().getParentIframe();
    parentContainer.register('webStorageSupport', function() {
      // We must reply to this event, or the JS SDK will not continue with the
      // popup flow. Web storage support is not actually needed though.
      return { status: 'ACK', webStorageSupport: true };
    }, gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER);

    var storedEvent = sessionStorage['firebase:redirectEvent:' + storageKey];
    if (storedEvent) {
      var authEvent = null;
      try {
        authEvent = JSON.parse(storedEvent);
      } catch (_) {
        return alert('Auth Emulator Internal Error: Invalid stored event.');
      }
      if (authEvent) {
        sendAuthEvent(parentContainer, authEvent);
      }
      delete sessionStorage['firebase:redirectEvent:' + storageKey];
    }
  }

  function sendAuthEvent(parentContainer, authEvent) {
    parentContainer.send('authEvent', {
      type: 'authEvent',
      authEvent: authEvent,
    }, function(responses) {
      if (!responses || !responses.length ||
          !responses[responses.length - 1].status === 'ACK') {
        return alert("Auth Emulator Internal Error: Sending authEvent failed.");
      }
    }, gapi.iframes.CROSS_ORIGIN_IFRAMES_FILTER);
  }

  window.gapi_onload = function () {
    gapi.load('gapi.iframes', {
      callback: initFrameMessaging,
      timeout: 10000,
      ontimeout: function () {
        return alert("Auth Emulator Internal Error: Error loading gapi.iframe! Please check your Internet connection.");
      },
    });
  }
</script>
<script src="https://apis.google.com/js/api.js"></script>
`
    );
  });
}

function createFakeClaims(info: ProviderUserInfo): string {
  const claims: IdpJwtPayload = {
    sub: info.rawId,
    iss: "",
    aud: "",
    exp: 0,
    iat: 0,
    name: info.displayName,
    // eslint-disable-next-line @typescript-eslint/camelcase
    screen_name: info.screenName,
    email: info.email,
    // eslint-disable-next-line @typescript-eslint/camelcase
    email_verified: true, // TODO: Shall we allow changing this?
    picture: info.photoUrl,
  };
  return JSON.stringify(claims);
}
