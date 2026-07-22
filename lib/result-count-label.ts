export function formatResultCountLabel(count: number, total?: number): string {
  if (typeof total === "number" && total !== count) {
    return `${count} / ${total} 件`
  }

  return `${count} 件`
}
