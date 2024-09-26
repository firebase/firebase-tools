import * as fs from "fs";
import * as path from "path";

import { browser } from "@wdio/globals";

import { firebaseTest, setup } from "../../utils/test_hooks";
import { FirebaseSidebar } from "../../utils/page_objects/sidebar";
import { EditorView } from "../../utils/page_objects/editor";

setup(() => {
  // TODO - generate a data connect SDK
});

firebaseTest("Generated SDK", async function () {
  it("configuration should insert the correct path in the connector.yaml file", async function () {});
});
