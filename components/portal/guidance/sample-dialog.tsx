'use client'

import Image from 'next/image'
import { AlertTriangle, FileImage } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { DocumentSample } from '@/lib/portal/guidance'

interface SampleDialogProps {
  sample: DocumentSample
}

// next.config.mjs で images.unoptimized: true のため、next/image は実寸の img として描画される。
export function SampleDialog({ sample }: SampleDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <FileImage className="h-3.5 w-3.5" aria-hidden />
          {sample.title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sample.title}</DialogTitle>
          {sample.caption && <DialogDescription>{sample.caption}</DialogDescription>}
        </DialogHeader>

        <Image
          src={sample.src}
          alt={`${sample.title}のサンプル`}
          width={sample.width}
          height={sample.height}
          className="h-auto w-full rounded-lg border border-border"
        />

        {sample.points && sample.points.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-foreground">交付請求時のポイント</h4>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              {sample.points.map((point) => (
                <li key={point} className="text-sm leading-6 text-foreground">
                  {point}
                </li>
              ))}
            </ol>
          </div>
        )}

        {sample.warning && (
          <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm leading-6 text-red-800">
            <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden />
            <span>{sample.warning}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
