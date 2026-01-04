"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWeekly = handleWeekly;
const rewards_1 = require("./rewards");
async function handleWeekly(message) {
    return (0, rewards_1.handleReward)(message, "weekly");
}
//# sourceMappingURL=weekly.js.map