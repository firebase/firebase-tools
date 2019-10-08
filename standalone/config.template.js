module.exports = {
  /*
    Headless mode forces the firepit builds to exactly imitate firebase-tools,
    so the resulting binary "firebase" is a drop in replacement for the script
    installed via npm. This is the behavior for CI / Cloud Shell / Docker etc.

    When headless mode is disabled, the "double click" experience is enabled
    which allows the binary to spawn a terminal on Windows and Mac. The is the
    behavior for desktop users.

    This placeholder is not in quotes because it is a boolean.
  */
  headless: headless_value,

  /*
    This is generally set to "firebase-tools@latest" however a custom value
    can be supplied for EAPs which would like to have builds pointed at
    specific tgz bundles.

    This placeholder is in quotes because it is a string.
   */
  firebase_tools_package: "firebase_tools_package_value"
};
