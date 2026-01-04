"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDaily = handleDaily;
const rewards_1 = require("./rewards");
async function handleDaily(message) {
    return (0, rewards_1.handleReward)(message, "daily");
}
//# sourceMappingURL=daily.js.map