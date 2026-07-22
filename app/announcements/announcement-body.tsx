import Link from "next/link"

const URL_PATTERN = /(https?:\/\/[^\s]+)/g

export function AnnouncementBody({ body }: { body: string }) {
  return (
    <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground break-words">
      {body.split(URL_PATTERN).map((part, index) => {
        if (!part.startsWith("http://") && !part.startsWith("https://")) {
          return <span key={index}>{part}</span>
        }

        return (
          <Link
            key={index}
            href={part}
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {part}
          </Link>
        )
      })}
    </div>
  )
}
