import prisma from "../utils/prisma";

export async function isAskBlocked(blockerId: string, requesterId: string): Promise<boolean> {
  const block = await prisma.askBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId: requesterId } },
  });
  return block !== null;
}

export async function blockRequester(blockerId: string, requesterId: string): Promise<void> {
  await prisma.askBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId: requesterId } },
    create: { blockerId, blockedId: requesterId },
    update: {},
  });
}

export async function unblockRequester(blockerId: string, requesterId: string): Promise<boolean> {
  try {
    await prisma.askBlock.delete({
      where: { blockerId_blockedId: { blockerId, blockedId: requesterId } },
    });
    return true;
  } catch {
    return false;
  }
}
