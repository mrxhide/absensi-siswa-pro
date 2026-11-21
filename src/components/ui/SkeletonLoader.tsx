export function SkeletonBox({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200/80 rounded-xl ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBox className="h-6 w-56" />
            <SkeletonBox className="h-4 w-40" />
          </div>
          <div className="flex gap-2">
            <SkeletonBox className="h-10 w-36" />
            <SkeletonBox className="h-10 w-28" />
          </div>
        </div>
        <SkeletonBox className="h-3 w-full rounded-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <SkeletonBox className="h-12 w-full" />
          <SkeletonBox className="h-12 w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="bg-white border border-[#E2E8F0] rounded-2xl p-4 space-y-3"
          >
            <SkeletonBox className="h-4 w-20" />
            <SkeletonBox className="h-8 w-14" />
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
        <SkeletonBox className="h-5 w-48" />
        {Array.from({ length: 4 }).map((_, idx) => (
          <SkeletonBox key={idx} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

export function CardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex items-center justify-between gap-3"
        >
          <div className="space-y-2 flex-1">
            <SkeletonBox className="h-4 w-44" />
            <SkeletonBox className="h-3.5 w-28" />
          </div>
          <SkeletonBox className="h-9 w-24" />
        </div>
      ))}
    </div>
  );
}
