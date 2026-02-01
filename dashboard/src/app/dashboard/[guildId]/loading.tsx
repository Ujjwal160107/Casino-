
export default function Loading() {
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse">
            {/* Header Skeleton */}
            <div className="space-y-4">
                <div className="h-8 w-64 bg-white/5 rounded-lg" />
                <div className="h-4 w-96 bg-white/5 rounded-lg" />
            </div>

            {/* Main Content Skeleton */}
            <div className="glass-card rounded-2xl p-6 md:p-8 space-y-8">
                {/* Form Field Skeletons */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <div className="h-4 w-24 bg-white/5 rounded" />
                        <div className="h-10 w-full bg-white/5 rounded-lg" />
                        <div className="h-3 w-32 bg-white/5 rounded" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-4 w-24 bg-white/5 rounded" />
                        <div className="h-10 w-full bg-white/5 rounded-lg" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <div className="h-4 w-24 bg-white/5 rounded" />
                        <div className="h-10 w-full bg-white/5 rounded-lg" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-4 w-24 bg-white/5 rounded" />
                        <div className="h-10 w-full bg-white/5 rounded-lg" />
                    </div>
                </div>

                {/* Toggle Skeleton */}
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
                    <div className="space-y-2">
                        <div className="h-4 w-32 bg-white/5 rounded" />
                        <div className="h-3 w-48 bg-white/5 rounded" />
                    </div>
                    <div className="h-7 w-12 bg-white/5 rounded-full" />
                </div>

                {/* Button Skeleton */}
                <div className="h-11 w-40 bg-white/5 rounded-lg" />
            </div>
        </div>
    );
}
