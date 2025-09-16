"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOUD_PUBSUB = exports.CLOUD_STORAGE = exports.CLOUD_PLATFORM = exports.FIREBASE_PLATFORM = exports.CLOUD_PROJECTS_READONLY = exports.USERINFO_EMAIL = exports.EMAIL = exports.OPENID = void 0;
// default scopes
exports.OPENID = "openid";
exports.EMAIL = "email";
exports.USERINFO_EMAIL = "https://www.googleapis.com/auth/userinfo.email";
exports.CLOUD_PROJECTS_READONLY = "https://www.googleapis.com/auth/cloudplatformprojects.readonly";
exports.FIREBASE_PLATFORM = "https://www.googleapis.com/auth/firebase";
// incremental scopes
exports.CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform";
exports.CLOUD_STORAGE = "https://www.googleapis.com/auth/devstorage.read_write";
exports.CLOUD_PUBSUB = "https://www.googleapis.com/auth/pubsub";
