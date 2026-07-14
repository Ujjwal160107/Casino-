import assert from "node:assert/strict";
import { calculatePenaltyAllocation } from "../services/penaltyService";

const cases = [
  {
    name: "wallet covers the full penalty",
    input: [100, 250, 500] as const,
    expected: { walletDebit: 100, bankDebit: 0, newWalletBalance: 150, newBankBalance: 500, debtAdded: 0 },
  },
  {
    name: "wallet and positive bank split the penalty",
    input: [100, 30, 500] as const,
    expected: { walletDebit: 30, bankDebit: 70, newWalletBalance: 0, newBankBalance: 430, debtAdded: 0 },
  },
  {
    name: "empty wallet charges a positive bank",
    input: [100, 0, 500] as const,
    expected: { walletDebit: 0, bankDebit: 100, newWalletBalance: 0, newBankBalance: 400, debtAdded: 0 },
  },
  {
    name: "empty wallet and bank create debt",
    input: [100, 0, 0] as const,
    expected: { walletDebit: 0, bankDebit: 100, newWalletBalance: 0, newBankBalance: -100, debtAdded: 100 },
  },
  {
    name: "partially funded bank becomes negative",
    input: [100, 20, 30] as const,
    expected: { walletDebit: 20, bankDebit: 80, newWalletBalance: 0, newBankBalance: -50, debtAdded: 50 },
  },
  {
    name: "existing debt increases by the unpaid remainder",
    input: [100, 0, -40] as const,
    expected: { walletDebit: 0, bankDebit: 100, newWalletBalance: 0, newBankBalance: -140, debtAdded: 100 },
  },
];

for (const testCase of cases) {
  const [amount, walletBalance, bankBalance] = testCase.input;
  const actual = calculatePenaltyAllocation(amount, walletBalance, bankBalance);
  assert.deepEqual(
    {
      walletDebit: actual.walletDebit,
      bankDebit: actual.bankDebit,
      newWalletBalance: actual.newWalletBalance,
      newBankBalance: actual.newBankBalance,
      debtAdded: actual.debtAdded,
    },
    testCase.expected,
    testCase.name,
  );
}

assert.throws(() => calculatePenaltyAllocation(0, 0, 0), /positive safe integer/);
assert.throws(() => calculatePenaltyAllocation(-1, 0, 0), /positive safe integer/);
assert.throws(() => calculatePenaltyAllocation(1.5, 0, 0), /positive safe integer/);

console.log(`penaltyService tests passed (${cases.length} allocation cases + invalid input checks).`);
