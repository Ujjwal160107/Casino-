import { TextGlow } from "@/components/ui/TextGlow";

export default function ModerationPage() {
    return (
        <div>
            <TextGlow variant="white">
                <h1 className="text-3xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400 mb-6">
                    Moderation Logs
                </h1>
            </TextGlow>
            <div className="p-12 border border-white/5 bg-zinc-900 rounded-xl text-center">
                <p className="text-zinc-400">View logs, user warnings, and ban appeals.</p>
                <div className="mt-4 inline-block px-4 py-2 bg-yellow-500/10 text-yellow-500 rounded-lg text-sm font-semibold border border-yellow-500/20">
                    Coming Soon
                </div>
            </div>
        </div>
    );
}
