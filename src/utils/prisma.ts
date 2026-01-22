import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export async function runWithRetry<T>(
    fn: (prisma: PrismaClient) => Promise<T>,
    maxRetries = 3,
    delay = 100
): Promise<T> {
    let retries = 0;
    while (true) {
        try {
            return await fn(prisma);
        } catch (error: any) {
            // P2034 = Transaction failed due to a write conflict or a deadlock.
            const isWriteConflict =
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2034';

            // Also check generic message for "WriteConflict" if code misses
            const isMessageMatch = error?.message?.includes('WriteConflict') || error?.message?.includes('deadlock');

            if ((isWriteConflict || isMessageMatch) && retries < maxRetries) {
                retries++;
                const backoff = delay * Math.pow(2, retries - 1); // 100, 200, 400ms...
                console.warn(`[Prisma] Write Conflict detected. Retrying transaction (${retries}/${maxRetries}) in ${backoff}ms...`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            throw error;
        }
    }
}

export default prisma;