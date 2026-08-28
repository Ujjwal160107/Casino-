import { describe, it, expect } from "vitest";
import {
  animalState,
  effectiveFedUntil,
  msUntilDeath,
  resolveLegalHousing,
  feedBill,
  incomeBill,
  RuleAnimal,
  IncomeAnimal,
} from "../../src/utils/zooRules";

const T0 = new Date("2026-08-27T00:00:00.000Z");
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

describe("animalState", () => {
  const caughtAt = T0;
  const fedUntil = hours(24);

  it("is fed right up to and including fedUntil", () => {
    expect(animalState({ fedUntil, caughtAt }, hours(23))).toBe("fed");
    expect(animalState({ fedUntil, caughtAt }, hours(24))).toBe("fed");
  });

  it("is hungry one millisecond after fedUntil", () => {
    const justAfter = new Date(fedUntil.getTime() + 1);
    expect(animalState({ fedUntil, caughtAt }, justAfter)).toBe("hungry");
  });

  it("is still hungry exactly at the end of the 72h grace", () => {
    expect(animalState({ fedUntil, caughtAt }, hours(24 + 72))).toBe("hungry");
  });

  it("is dead one millisecond past the grace", () => {
    const dead = new Date(fedUntil.getTime() + 72 * 3_600_000 + 1);
    expect(animalState({ fedUntil, caughtAt }, dead)).toBe("dead");
  });

  it("treats a null fedUntil as caughtAt + 24h, not as starving forever", () => {
    expect(effectiveFedUntil({ fedUntil: null, caughtAt }).getTime()).toBe(hours(24).getTime());
    expect(animalState({ fedUntil: null, caughtAt }, hours(1))).toBe("fed");
    expect(animalState({ fedUntil: null, caughtAt }, hours(30))).toBe("hungry");
  });

  it("reports time left before death", () => {
    expect(msUntilDeath({ fedUntil, caughtAt }, hours(48))).toBe(48 * 3_600_000);
  });
});

function animal(id: string, animalKey: string, rarity: RuleAnimal["rarity"], caughtAtHours: number): RuleAnimal {
  return { id, animalKey, rarity, caughtAt: hours(caughtAtHours) };
}

describe("resolveLegalHousing", () => {
  it("evicts everything when the player owns no zoo", () => {
    const animals = [animal("a", "rabbit", "Common", 0)];
    expect(resolveLegalHousing(animals, null)).toEqual({ keep: [], evict: ["a"] });
  });

  it("keeps a legal zoo untouched", () => {
    const animals = [
      animal("a", "rabbit", "Common", 0),
      animal("b", "fox", "Common", 1),
      animal("c", "deer", "Uncommon", 2),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "mini_zoo");
    expect(evict).toEqual([]);
    expect(keep.sort()).toEqual(["a", "b", "c"]);
  });

  it("trims a species to its stack limit, keeping the oldest", () => {
    const animals = [
      animal("r1", "rabbit", "Common", 0),
      animal("r2", "rabbit", "Common", 1),
      animal("r3", "rabbit", "Common", 2),
      animal("r4", "rabbit", "Common", 3),
      animal("r5", "rabbit", "Common", 4),
      animal("r6", "rabbit", "Common", 5),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "world_zoo");
    expect(keep.sort()).toEqual(["r1", "r2", "r3", "r4"]);
    expect(evict.sort()).toEqual(["r5", "r6"]);
  });

  it("caps Legendaries at one copy", () => {
    const animals = [
      animal("t1", "white_tiger", "Legendary", 0),
      animal("t2", "white_tiger", "Legendary", 1),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "world_zoo");
    expect(keep).toEqual(["t1"]);
    expect(evict).toEqual(["t2"]);
  });

  it("evicts a Legendary entirely from a City Zoo", () => {
    const animals = [
      animal("c1", "rabbit", "Common", 0),
      animal("t1", "white_tiger", "Legendary", 1),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "city_zoo");
    expect(keep).toEqual(["c1"]);
    expect(evict).toEqual(["t1"]);
  });

  it("trims species over the rarity mix, keeping the longest-held", () => {
    // Mini Zoo allows 3 Common species; four are housed.
    const animals = [
      animal("a", "rabbit", "Common", 0),
      animal("b", "fox", "Common", 1),
      animal("c", "duck", "Common", 2),
      animal("d", "squirrel", "Common", 3),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "mini_zoo");
    expect(keep.sort()).toEqual(["a", "b", "c"]);
    expect(evict).toEqual(["d"]);
  });

  it("applies the stack cap before the mix cap", () => {
    // squirrel is newest as a species, so it loses the 3rd Common slot even
    // though rabbit contributes more animals.
    const animals = [
      animal("r1", "rabbit", "Common", 0),
      animal("r2", "rabbit", "Common", 1),
      animal("r3", "rabbit", "Common", 2),
      animal("r4", "rabbit", "Common", 3),
      animal("r5", "rabbit", "Common", 4),
      animal("f1", "fox", "Common", 5),
      animal("d1", "duck", "Common", 6),
      animal("s1", "squirrel", "Common", 7),
    ];
    const { keep, evict } = resolveLegalHousing(animals, "mini_zoo");
    expect(keep.sort()).toEqual(["d1", "f1", "r1", "r2", "r3", "r4"]);
    expect(evict.sort()).toEqual(["r5", "s1"]);
  });

  it("handles an empty zoo", () => {
    expect(resolveLegalHousing([], "world_zoo")).toEqual({ keep: [], evict: [] });
  });
});

describe("feedBill", () => {
  it("bills one unit per hungry animal at that rarity's price", () => {
    const bill = feedBill([
      { rarity: "Common" }, { rarity: "Common" },
      { rarity: "Legendary" },
    ]);
    expect(bill.total).toBe(2 * 1_500 + 75_000);
    expect(bill.lines).toEqual([
      { rarity: "Common", units: 2, cost: 3_000 },
      { rarity: "Legendary", units: 1, cost: 75_000 },
    ]);
  });

  it("orders lines cheapest rarity first so partial feeding starts there", () => {
    const bill = feedBill([{ rarity: "Rare" }, { rarity: "Common" }, { rarity: "Uncommon" }]);
    expect(bill.lines.map((l) => l.rarity)).toEqual(["Common", "Uncommon", "Rare"]);
  });

  it("is empty when nothing is hungry", () => {
    expect(feedBill([])).toEqual({ lines: [], total: 0 });
  });
});

function income(
  animalKey: string,
  rarity: IncomeAnimal["rarity"],
  fedUntilHours: number,
): IncomeAnimal {
  return { animalKey, rarity, fedUntil: hours(fedUntilHours), caughtAt: T0 };
}

describe("incomeBill", () => {
  const now = hours(100);

  it("pays per-day income for fed animals only, grouped by species", () => {
    const housed: IncomeAnimal[] = [
      income("rabbit", "Common", 200),
      income("rabbit", "Common", 150),
      income("fox", "Common", 50), // hungry: fedUntil is in the past but within the 72h grace
      income("deer", "Uncommon", 300),
    ];
    const bill = incomeBill(housed, now);
    expect(bill.total).toBe(2 * 4_000 + 16_000);
    expect(bill.lines).toEqual([
      { animalKey: "fox", rarity: "Common", fedCount: 0, hungryCount: 1, incomePerDay: 0 },
      { animalKey: "rabbit", rarity: "Common", fedCount: 2, hungryCount: 0, incomePerDay: 8_000 },
      { animalKey: "deer", rarity: "Uncommon", fedCount: 1, hungryCount: 0, incomePerDay: 16_000 },
    ]);
  });

  it("splits fed and hungry counts within the same species", () => {
    const housed: IncomeAnimal[] = [
      income("rabbit", "Common", 200),
      income("rabbit", "Common", 200),
      income("rabbit", "Common", 50),
    ];
    const bill = incomeBill(housed, now);
    expect(bill.lines).toEqual([
      { animalKey: "rabbit", rarity: "Common", fedCount: 2, hungryCount: 1, incomePerDay: 8_000 },
    ]);
    expect(bill.total).toBe(8_000);
  });

  it("is empty when there are no housed animals", () => {
    expect(incomeBill([], now)).toEqual({ lines: [], total: 0 });
  });
});
