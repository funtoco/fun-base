"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/utils"
import { Calendar, FileText, CheckSquare, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

export interface TimelineItem {
  id: string
  type: "meeting" | "visa" | "support" | "other"
  title: string
  description?: string
  datetime: string
  status?: string
  personName?: string
  href?: string
}

interface TimelineProps {
  items: TimelineItem[]
  className?: string
}

const typeIcons = {
  meeting: Calendar,
  visa: FileText,
  support: CheckSquare,
  other: Clock,
}

const typeColors = {
  meeting: "text-blue-600 bg-blue-100",
  visa: "text-green-600 bg-green-100",
  support: "text-orange-600 bg-orange-100",
  other: "text-gray-600 bg-gray-100",
}

export function Timeline({ items, className }: TimelineProps) {
  const router = useRouter()

  const handleItemClick = (item: TimelineItem) => {
    if (item.href) {
      router.push(item.href)
      return
    }

    switch (item.type) {
      case "meeting":
        router.push("/meetings")
        break
      case "visa":
        router.push("/visas")
        break
      case "support":
        router.push("/support")
        break
      default:
        router.push("/timeline")
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      {items.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">アクティビティがありません</p>
          </CardContent>
        </Card>
      ) : (
        items.map((item, index) => {
          const Icon = typeIcons[item.type]
          const isLast = index === items.length - 1

          return (
            <div key={item.id} className="flex gap-4">
              {/* Timeline line and icon */}
              <div className="flex flex-col items-center">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", typeColors[item.type])}>
                  <Icon className="h-5 w-5" />
                </div>
                {!isLast && <div className="w-px h-8 bg-border mt-2" />}
              </div>

              {/* Content */}
              <Card
                className={cn("flex-1 transition-colors cursor-pointer hover:bg-muted/50")}
                onClick={() => handleItemClick(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm leading-tight">{item.title}</h4>
                      {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                      {item.personName && <p className="text-xs text-muted-foreground mt-1">対象: {item.personName}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <time className="text-xs text-muted-foreground">{formatDate(item.datetime)}</time>
                      {item.status && (
                        <Badge variant="outline" className="text-xs">
                          {item.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })
      )}
    </div>
  )
}
