"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMonthly = handleMonthly;
const rewards_1 = require("./rewards");
async function handleMonthly(message) {
    return (0, rewards_1.handleReward)(message, "monthly");
}
//# sourceMappingURL=monthly.js.map