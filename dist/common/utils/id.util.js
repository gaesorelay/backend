"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUUIDToken = exports.generateRoomId = void 0;
const crypto_1 = require("crypto");
const generateRoomId = (length = 6) => {
    const bytes = (0, crypto_1.randomBytes)(length);
    let result = '';
    for (let index = 0; index < length; index += 1) {
        result += String.fromCharCode(65 + (bytes[index] % 26));
    }
    return result;
};
exports.generateRoomId = generateRoomId;
const generateUUIDToken = () => (0, crypto_1.randomUUID)();
exports.generateUUIDToken = generateUUIDToken;
//# sourceMappingURL=id.util.js.map