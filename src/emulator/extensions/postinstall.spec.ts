import { expect } from "chai";
import * as postinstall from "./postinstall";
import { EmulatorRegistry } from "../registry";
import { Emulators } from "../types";
import { FakeEmulator } from "../testing/fakeEmulator";

describe("replaceConsoleLinks", () => {
  let host: string;
  let port: number;
  before(async () => {
    const emu = await FakeEmulator.create(Emulators.UI);
    host = emu.getInfo().host;
    port = emu.getInfo().port;
    return EmulatorRegistry.start(emu);
  });

  after(async () => {
    await EmulatorRegistry.stopAll();
  });

  const tests: {
    desc: string;
    input: string;
    expected: () => string;
  }[] = [
    {
      desc: "should replace Firestore links",
      input:
        " Go to your [Cloud Firestore dashboard](https://console.firebase.google.com/project/test-project/firestore/data) in the Firebase console.",
      expected: () =>
        ` Go to your [Cloud Firestore dashboard](http://${host}:${port}/firestore) in the Firebase console.`,
    },
    {
      desc: "should replace Functions links",
      input:
        " Go to your [Cloud Functions dashboard](https://console.firebase.google.com/project/test-project/functions/logs) in the Firebase console.",
      expected: () =>
        ` Go to your [Cloud Functions dashboard](http://${host}:${port}/logs) in the Firebase console.`,
    },
    {
      desc: "should replace Extensions links",
      input:
        " Go to your [Extensions dashboard](https://console.firebase.google.com/project/test-project/extensions) in the Firebase console.",
      expected: () =>
        ` Go to your [Extensions dashboard](http://${host}:${port}/extensions) in the Firebase console.`,
    },
    {
      desc: "should replace RTDB links",
      input:
        " Go to your [Realtime database dashboard](https://console.firebase.google.com/project/test-project/database/test-walkthrough/data) in the Firebase console.",
      expected: () =>
        ` Go to your [Realtime database dashboard](http://${host}:${port}/database) in the Firebase console.`,
    },
    {
      desc: "should replace Auth links",
      input:
        " Go to your [Auth dashboard](https://console.firebase.google.com/project/test-project/authentication/users) in the Firebase console.",
      expected: () =>
        ` Go to your [Auth dashboard](http://${host}:${port}/auth) in the Firebase console.`,
    },
    {
      desc: "should replace multiple GAIA user links ",
      input:
        " Go to your [Auth dashboard](https://console.firebase.google.com/u/0/project/test-project/authentication/users) in the Firebase console.",
      expected: () =>
        ` Go to your [Auth dashboard](http://${host}:${port}/auth) in the Firebase console.`,
    },
    {
      desc: "should replace multiple links",
      input:
        " Go to your [Cloud Firestore dashboard](https://console.firebase.google.com/project/jh-walkthrough/firestore/data) or [Realtime database dashboard](https://console.firebase.google.com/project/test-project/database/test-walkthrough/data)in the Firebase console.",
      expected: () =>
        ` Go to your [Cloud Firestore dashboard](http://${host}:${port}/firestore) or [Realtime database dashboard](http://${host}:${port}/database)in the Firebase console.`,
    },
    {
      desc: "should not replace other links",
      input: " Go to your [Stripe dashboard](https://stripe.com/payments) to see more information.",
      expected: () =>
        " Go to your [Stripe dashboard](https://stripe.com/payments) to see more information.",
    },
  ];

  for (const t of tests) {
    it(t.desc, () => {
      expect(postinstall.replaceConsoleLinks(t.input)).to.equal(t.expected());
    });
  }
}).timeout(2000);
