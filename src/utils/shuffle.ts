import { randomInt } from "crypto";

/**
 * Uniformly shuffled copy (Fisher-Yates). Sorting with a random comparator is
 * not a uniform shuffle: some orders come up far more often than others, which
 * players can exploit wherever the order decides money.
 */
export function shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
