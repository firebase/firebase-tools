const utils = require("../../utils");

/**
 * validateConfig takes a hosting config from firebase.json and scans for
 * known malformed glob constructs, printing warning messages on sight
 */
function validateConfig(config) {
  if (!config) {
    return;
  }

  // rewrites
  if (_.isArray(config.rewrites)) {
    config.rewrites.map(function(rewrite) {
      _validateGlob(rewrite.source);
      if (rewrite.destination && !rewrite.function) {
        _validateGlob(rewrite.destination);
      }
    });
  }

  // redirects
  if (_.isArray(config.redirects)) {
    config.redirects.map(function(redirect) {
      _validateGlob(redirect.source);
      if (redirect.destination) {
        _validateGlob(redirect.destination);
      }
    });
  }

  // headers
  if (_.isArray(config.headers)) {
    config.headers.map(function(header) {
      validateGlob(header.source);
      if (header.destination) {
        _validateGlob(header.destination);
      }
    });
  }
}

function _validateGlob(glob) {
  for (var w of _scanGlob(glob)) {
    utils.logWarning(w);
  }
}

function _scanGlob(glob) {
  warnings = [];
  function _warn(message) {
    warnings.push("Configured glob [" + glob + "] " + message);
  }

  // multiple slashes
  if (glob.includes("//")) {
    _warn(
      "contains multiple slash delimiters '//'; note that these will only match exactly the same number of slashes in a path"
    );
  }

  // breached recursion limit
  if ((glob.match(/\*\*/g) || []).length > 3) {
    _warn(
      "contains 3+ chained ** wildcards, which may result in degraded performance or unexpected behavior"
    );
  }

  // breached length limit
  if (glob.length > 500) {
    _warn("is longer than 500 characters and will be ignored by the Firebase hosting backend");
  }

  // malformed redirect captures
  // - containing RFC1738 unsafe/reserved characters in their name
  // - contains special pathToRegexp characters
  // - beginning in the middle of a segment
  for (var segment of glob.split("/")) {
    if (segment[0] == ":") {
      if (segment.includes("?") || segment.includes("+") || segment.includes("*")) {
        _warn(
          "contains a capture redirect " +
            segment +
            " with a character (?+*) with special meaning in Express paths; this will break if you are expecting literal matching"
        );
      } else if (!/^:[^()\|\\\^~\[\];\/\?:@\-&]*\??$/.test(segment)) {
        _warn(
          "contains a capture redirect " +
            segment +
            " with a RFC1738 unsafe or reserved character; this glob will not be evaluated"
        );
      }
    } else if (segment.includes(":")) {
      _warn(
        "contains an illegal capture redirect " +
          segment +
          " beginning in the middle of the path segment"
      );
    }
  }

  // malformed extglobs/classes
  // - unclosed (), []
  // - '/' inside extglob
  var stackLevel = 0;
  var inClass = false;
  for (var c of glob) {
    switch (c) {
      case "[":
        inClass = true;
        break;
      case "]":
        if (!inClass) {
          _warn("contains an character class close ']' without corresponding '['");
        }
        inClass = false;
        break;
      case "(":
        if (!inClass) {
          stackLevel++;
        }
        break;
      case ")":
        if (!inClass) {
          if (stackLevel == 0) {
            _warn("contains an extglob close ')' without corresponding '('");
          } else {
            stackLevel--;
          }
        }
        break;
      case "/":
        if (stackLevel > 0) {
          _warn(
            "contains '/' inside an extglob '()'. This behavior is undefined and will not match as intended."
          );
        }
        break;
    }
  }
  if (stackLevel > 0) {
    _warn("contains an unclosed extglob paren '('");
  }
  if (inClass) {
    _warn("contains an unclosed character class '['");
  }

  // numerical brace expansion {1..10}
  if (/{\d+\.\.\d+}/.test(glob)) {
    _warn("contains an unsupported numerical range brace expansion {x..y}");
  }

  return warnings;
}

module.exports = {
  validateConfig: validateConfig,
  testHook: _scanGlob,
};
