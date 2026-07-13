import {
    AttachmentBuilder,
    ContainerBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from "discord.js";
import { Mascot, getEmoteUrl } from "../config/branding";

export type StatusKind = "info" | "success" | "error";

const KIND_EMOTE: Record<StatusKind, string> = {
    info: Mascot.Emotes.Think,
    success: Mascot.Emotes.Success,
    error: Mascot.Emotes.Fail,
};

export interface StatusOptions {
    /** Pre-formatted "-# ..." line — use nextStepHint() from config/nextSteps. */
    hint?: string;
    /** Override the mascot image (attachment:// or CDN url). */
    thumbnailUrl?: string;
}

/**
 * Minimal status container: text left, mascot reaction thumbnail right.
 * House rules enforced here: no accent color, no footer, no timestamp.
 */
export function statusContainer(kind: StatusKind, title: string, desc?: string, opts?: StatusOptions): ContainerBuilder {
    const container = new ContainerBuilder();
    const body = `## ${title}` + (desc ? `\n${desc}` : "");
    const thumbUrl = opts?.thumbnailUrl ?? getEmoteUrl(KIND_EMOTE[kind]);

    if (thumbUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl)),
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
    }

    if (opts?.hint) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false),
        );
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(opts.hint));
    }
    return container;
}

export function infoContainer(title: string, desc?: string, opts?: StatusOptions) {
    return statusContainer("info", title, desc, opts);
}

export function successContainer(title: string, desc?: string, opts?: StatusOptions) {
    return statusContainer("success", title, desc, opts);
}

export function errorContainer(title: string, desc?: string, opts?: StatusOptions) {
    return statusContainer("error", title, desc, opts);
}

/** Bare container from markdown blocks (one TextDisplay per block). */
export function plainContainer(...blocks: string[]): ContainerBuilder {
    const container = new ContainerBuilder();
    for (const block of blocks) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block));
    }
    return container;
}

/**
 * Standard ComponentsV2 payload for reply / send / edit / update.
 * House style restates the flag on edits (see bankInteractionHandler).
 */
export function v2Reply(
    containers: ContainerBuilder | ContainerBuilder[],
    files?: AttachmentBuilder[],
    extraFlags: number = 0,
) {
    return {
        components: Array.isArray(containers) ? containers : [containers],
        ...(files && files.length ? { files } : {}),
        flags: MessageFlags.IsComponentsV2 | extraFlags,
    };
}
