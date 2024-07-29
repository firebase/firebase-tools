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
      desc: "Empty folder, long path name",
      folderName: "root/abcd/test/",
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
      desc: "Web identifier 2",
      folderName: "test/",
      folderItems: { file1: "contents", node_modules: { dep1: "firebase", dep2: "dataconnect" } },
      output: Platform.WEB,
    },
    {
      desc: "Android identifier 1",
      folderName: "/test",
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
      desc: "Android identifier, long path name",
      folderName: "is/this/an/android/test",
      folderItems: { file1: "contents", "androidmanifest.xml": "my android contents" },
      output: Platform.ANDROID,
    },
    {
      desc: "iOS file identifier 1",
      folderName: "test/",
      folderItems: { file1: "contents", podfile: "cocoa pods yummy" },
      output: Platform.IOS,
    },
    {
      desc: "iOS file identifier 2",
      folderName: "root/abcd",
      folderItems: {
        file1: "ios",
        "myapp.xcodeproj": "folder in an xcode folder",
      },
      output: Platform.IOS,
    },
    {
      desc: "iOS folder identifier 3",
      folderName: "/users/googler/myprojects",
      folderItems: {
        "myapp.xcworkspace": { file1: "contents" },
      },
      output: Platform.IOS,
    },
    {
      desc: "multiple identifiers, returns first found",
      folderName: "test/",
      folderItems: {
        file1: "contents",
        podfile: "cocoa pods yummy",
        "androidmanifest.xml": "file found second :(",
      },
      output: Platform.ANDROID,
    },
  ];
  for (const c of cases) {
    it(c.desc, async () => {
      mockfs({ [c.folderName]: c.folderItems });
      const platform = await getPlatformFromFolder(c.folderName);
      expect(platform).to.equal(c.output);
    });
    afterEach(() => {
      mockfs.restore();
    });
  }
});
