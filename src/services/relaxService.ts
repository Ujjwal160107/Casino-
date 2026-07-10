import prisma from "../utils/prisma";
import { RELAX_OPTIONS, RELAX_OPTION_ORDER, RelaxOptionId, clampStress, getRelaxOption } from "../utils/economyConfig";

export type RelaxSnapshot = {
  walletBalance: number;
  jobStress: number;
  educationStress: number | null;
  hasEducation: boolean;
};

export async function getRelaxSnapshot(discordId: string, username = "UnknownUser"): Promise<RelaxSnapshot> {
  const user = await prisma.user.upsert({
    where: { discordId },
    update: { username },
    create: {
      discordId,
      username,
      wallet: { create: { balance: 0 } }
    },
    include: {
      wallet: true,
      currentEducation: true
    }
  });

  if (!user.wallet) {
    const updatedUser = await prisma.user.update({
      where: { discordId },
      data: { wallet: { create: { balance: 0 } } },
      include: { wallet: true, currentEducation: true }
    });

    return {
      walletBalance: updatedUser.wallet?.balance ?? 0,
      jobStress: clampStress(updatedUser.jobStress ?? 0),
      educationStress: updatedUser.currentEducation ? clampStress(updatedUser.currentEducation.stress) : null,
      hasEducation: Boolean(updatedUser.currentEducation)
    };
  }

  return {
    walletBalance: user.wallet.balance,
    jobStress: clampStress(user.jobStress ?? 0),
    educationStress: user.currentEducation ? clampStress(user.currentEducation.stress) : null,
    hasEducation: Boolean(user.currentEducation)
  };
}

export function listRelaxOptions() {
  return RELAX_OPTION_ORDER.map((id) => RELAX_OPTIONS[id]);
}

export async function applyRelaxOption(discordId: string, username: string, optionId: RelaxOptionId | string) {
  const option = getRelaxOption(optionId);
  if (!option) throw new Error("Unknown relax option.");

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({
      where: { discordId },
      include: { wallet: true, currentEducation: true }
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          discordId,
          username,
          wallet: { create: { balance: 0 } }
        },
        include: { wallet: true, currentEducation: true }
      });
    }

    if (!user.wallet) {
      user = await tx.user.update({
        where: { discordId },
        data: { wallet: { create: { balance: 0 } } },
        include: { wallet: true, currentEducation: true }
      });
    }

    const previousJobStress = clampStress(user.jobStress ?? 0);
    const previousEducationStress = user.currentEducation ? clampStress(user.currentEducation.stress) : null;
    const hasStress = previousJobStress > 0 || (previousEducationStress ?? 0) > 0;

    if (!hasStress) {
      throw new Error("You are already fully relaxed.");
    }

    if (user.wallet!.balance < option.cost) {
      throw new Error(`You need ${option.cost} in your wallet for ${option.name}.`);
    }

    const nextJobStress = clampStress(previousJobStress - option.jobStressReduction);
    const nextEducationStress = previousEducationStress === null
      ? null
      : clampStress(previousEducationStress - option.educationStressReduction);

    await tx.wallet.update({
      where: { id: user.wallet!.id },
      data: { balance: { decrement: option.cost } }
    });

    await tx.transaction.create({
      data: {
        walletId: user.wallet!.id,
        amount: -option.cost,
        type: "relax",
        meta: {
          optionId: option.id,
          optionName: option.name,
          previousJobStress,
          nextJobStress,
          previousEducationStress,
          nextEducationStress
        },
        isEarned: false
      }
    });

    if (previousJobStress !== nextJobStress) {
      await tx.user.update({
        where: { discordId },
        data: { jobStress: nextJobStress }
      });
    }

    if (user.currentEducation && nextEducationStress !== null && previousEducationStress !== nextEducationStress) {
      await tx.userEducation.update({
        where: { id: user.currentEducation.id },
        data: { stress: nextEducationStress }
      });
    }

    return {
      option,
      cost: option.cost,
      previousWalletBalance: user.wallet!.balance,
      walletBalance: user.wallet!.balance - option.cost,
      previousJobStress,
      jobStress: nextJobStress,
      previousEducationStress,
      educationStress: nextEducationStress
    };
  });
}
