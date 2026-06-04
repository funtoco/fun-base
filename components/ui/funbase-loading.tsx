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

      <div className="flex w-full max-w-[360px] flex-col items-center gap-6">
        <div className="funbase-loader-mark relative grid h-16 w-16 place-items-center rounded-lg border border-primary/15 bg-card/85 shadow-[0_20px_60px_rgba(59,139,255,0.18)] backdrop-blur">
          <div className="absolute inset-2 rounded-md bg-[linear-gradient(135deg,rgba(59,139,255,0.16),rgba(74,196,163,0.14))]" />
          <span className="relative text-lg font-bold text-primary">FB</span>
        </div>

        <div className="space-y-2 text-center">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-primary/10">
          <div className="funbase-loader-progress h-full w-1/2 rounded-full bg-[linear-gradient(90deg,transparent,#3b8bff,#4ac4a3,transparent)]" />
        </div>

        {showSkeleton ? (
          <div className="w-full space-y-2 rounded-lg border border-border/80 bg-card/70 p-3 shadow-sm backdrop-blur">
            <div className="funbase-loader-shimmer h-3 rounded-full bg-muted" />
            <div className="funbase-loader-shimmer h-3 w-5/6 rounded-full bg-muted [animation-delay:120ms]" />
            <div className="funbase-loader-shimmer h-3 w-2/3 rounded-full bg-muted [animation-delay:240ms]" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
