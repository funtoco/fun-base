import { cn } from "@/lib/utils"

type FunBaseLoadingProps = {
  title?: string
  description?: string
  variant?: "fullscreen" | "page" | "inline"
  showSkeleton?: boolean
}

export function FunBaseLoading({
  title = "読み込み中",
  description = "データを準備しています",
  variant = "page",
  showSkeleton = true,
}: FunBaseLoadingProps) {
  return (
    <div
      className={cn(
        "relative isolate flex items-center justify-center overflow-hidden bg-background px-6",
        variant === "fullscreen" && "min-h-screen",
        variant === "page" && "min-h-[360px] py-14",
        variant === "inline" && "min-h-[180px] py-8",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(59,139,255,0.12),rgba(255,255,255,0)_38%,rgba(74,196,163,0.10)_78%,rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(59,139,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(59,139,255,0.06)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_76%,transparent)]" />

      <div className="flex w-full max-w-[420px] flex-col items-center gap-5">
        <div className="space-y-2 text-center">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-primary/10">
          <div className="funbase-loader-progress h-full w-1/2 rounded-full bg-[linear-gradient(90deg,transparent,#3b8bff,#4ac4a3,transparent)]" />
        </div>

        {showSkeleton ? (
          <div className="w-full space-y-3 rounded-lg border border-border/80 bg-card/70 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="funbase-loader-shimmer h-9 w-9 shrink-0 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="funbase-loader-shimmer h-3 w-2/3 rounded-full bg-muted" />
                <div className="funbase-loader-shimmer h-3 w-1/2 rounded-full bg-muted [animation-delay:120ms]" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="funbase-loader-shimmer h-12 rounded-md bg-muted [animation-delay:160ms]" />
              <div className="funbase-loader-shimmer h-12 rounded-md bg-muted [animation-delay:240ms]" />
              <div className="funbase-loader-shimmer h-12 rounded-md bg-muted [animation-delay:320ms]" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function PersonDetailLoadingSkeleton() {
  return (
    <div className="p-6 space-y-6" role="status" aria-label="人材詳細を読み込んでいます">
      <div className="flex justify-end">
        <div className="funbase-loader-shimmer h-9 w-20 rounded-md bg-muted" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-6">
          <div className="funbase-loader-shimmer h-20 w-20 shrink-0 rounded-full bg-muted" />
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <div className="funbase-loader-shimmer h-6 w-48 rounded-full bg-muted" />
              <div className="funbase-loader-shimmer h-4 w-32 rounded-full bg-muted [animation-delay:120ms]" />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="funbase-loader-shimmer h-6 w-20 rounded-full bg-muted [animation-delay:160ms]" />
              <div className="funbase-loader-shimmer h-6 w-28 rounded-full bg-muted [animation-delay:220ms]" />
              <div className="funbase-loader-shimmer h-6 w-24 rounded-full bg-muted [animation-delay:280ms]" />
            </div>
          </div>
          <div className="hidden space-y-2 sm:block">
            <div className="funbase-loader-shimmer h-7 w-24 rounded-full bg-muted [animation-delay:180ms]" />
            <div className="funbase-loader-shimmer h-6 w-32 rounded-full bg-muted [animation-delay:260ms]" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex gap-2">
            <div className="funbase-loader-shimmer h-10 w-24 rounded-md bg-muted" />
            <div className="funbase-loader-shimmer h-10 w-24 rounded-md bg-muted [animation-delay:120ms]" />
            <div className="funbase-loader-shimmer h-10 w-24 rounded-md bg-muted [animation-delay:240ms]" />
          </div>
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="funbase-loader-shimmer h-8 w-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="funbase-loader-shimmer h-3 w-2/3 rounded-full bg-muted" />
                    <div className="funbase-loader-shimmer h-3 w-1/3 rounded-full bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, cardIndex) => (
            <div key={cardIndex} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="funbase-loader-shimmer mb-5 h-5 w-28 rounded-full bg-muted" />
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((__, rowIndex) => (
                  <div key={rowIndex} className="flex items-center justify-between gap-4">
                    <div className="funbase-loader-shimmer h-3 w-24 rounded-full bg-muted" />
                    <div className="funbase-loader-shimmer h-3 w-20 rounded-full bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
