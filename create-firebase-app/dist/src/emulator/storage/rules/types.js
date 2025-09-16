"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataLoadStatus = exports.RulesetOperationMethod = void 0;
var RulesetOperationMethod;
(function (RulesetOperationMethod) {
    RulesetOperationMethod["READ"] = "read";
    RulesetOperationMethod["WRITE"] = "write";
    RulesetOperationMethod["GET"] = "get";
    RulesetOperationMethod["LIST"] = "list";
    RulesetOperationMethod["CREATE"] = "create";
    RulesetOperationMethod["UPDATE"] = "update";
    RulesetOperationMethod["DELETE"] = "delete";
})(RulesetOperationMethod = exports.RulesetOperationMethod || (exports.RulesetOperationMethod = {}));
var DataLoadStatus;
(function (DataLoadStatus) {
    DataLoadStatus["OK"] = "ok";
    DataLoadStatus["NOT_FOUND"] = "not_found";
    DataLoadStatus["INVALID_STATE"] = "invalid_state";
})(DataLoadStatus = exports.DataLoadStatus || (exports.DataLoadStatus = {}));
