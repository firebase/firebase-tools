import { expect } from "chai";
import { getPlatformFromFolder } from "./fileUtils";
import { Platform } from "./types";
import * as mockfs from "mock-fs";
import FileSystem from "mock-fs/lib/filesystem";

describe("getPlatformFromFolder", () => {
  const cases: {
    desc: string;
    folderName: string;
    folderItems: FileSystem.DirectoryItems;
    output: Platform;
  }[] = [
    {
      desc: "Empty folder",
      folderName: "test/",
      folderItems: {},
      output: Platform.UNDETERMINED,
    },
    {
      desc: "folder w/ no identifier",
      folderName: "test/",
      folderItems: { file1: "contents", randomfile2: "my android contents" },
      output: Platform.UNDETERMINED,
    },
    {
      desc: "Web identifier 1",
      folderName: "test/",
      folderItems: { file1: "contents", "package.json": "node" },
      output: Platform.WEB,
    },
    {
      desc: "Android identifier 1",
      folderName: "/root/test/",
      folderItems: { file1: "contents", "androidmanifest.xml": "my android contents" },
      output: Platform.ANDROID,
    },
    {
      desc: "Android identifier 2",
      folderName: "/test/",
      folderItems: {
        "build.gradle": "contents",
        file2: "my android contents",
      },
      output: Platform.ANDROID,
    },
    {
      desc: "iOS file identifier 1",
      folderName: "test/",
      folderItems: { file1: "contents", podfile: "cocoa pods yummy" },
      output: Platform.IOS,
    },
    {
      desc: "iOS folder identifier 1, priority over android file",
      folderName: "root/abcd/myapp.xcodeproj",
      folderItems: {
        file1: "contents",
        "androidmanifest.xml": "why is an android file in an xcode workspace?",
      },
      output: Platform.IOS,
    },
    {
      desc: "iOS folder identifier 2",
      folderName: "/users/googler/myprojects/myapp.xcworkspace/",
      folderItems: {
        "myapp.xcworkspace": { file1: "contents" },
      },
      output: Platform.IOS,
    },
  ];
  for (const c of cases) {
    it(c.desc, async () => {
      mockfs({ [c.folderName]: c.folderItems });
      const platform = await getPlatformFromFolder(c.folderName);
      expect(platform).to.equal(c.output);
    });
  }
});
