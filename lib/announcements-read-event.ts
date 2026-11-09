const EVENT_NAME = 'funbase:announcements-read'

type ReadEvent = Event & { detail: { userId: string; ids: string[] } }

export function announceAnnouncementsRead(target: EventTarget, userId: string, ids: string[]): void {
  if (ids.length === 0) return
  const event = new Event(EVENT_NAME) as ReadEvent
  event.detail = { userId, ids }
  target.dispatchEvent(event)
}

export function listenForAnnouncementsRead(
  target: EventTarget,
  userId: string,
  onRead: (ids: string[]) => void,
): () => void {
  const listener = (event: Event) => {
    const detail = (event as ReadEvent).detail
    if (detail?.userId === userId) onRead(detail.ids)
  }
  target.addEventListener(EVENT_NAME, listener)
  return () => target.removeEventListener(EVENT_NAME, listener)
}
