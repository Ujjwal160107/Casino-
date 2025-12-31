
import { parseDuration } from "./src/utils/format";

const cases = [
    "10s",
    "10 s",
    "5m",
    "300",
    "10",
    "1h",
    "0",
    "off",
    "10m 30s",
    "invalid"
];

console.log("Testing parseDuration:");
cases.forEach(c => {
    const res = parseDuration(c);
    console.log(`'${c}' -> ${res}`);
});
