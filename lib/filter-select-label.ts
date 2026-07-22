export interface FilterSelectOption {
  value: string
  label: string
}

export function getFilterSelectDisplayLabel({
  label,
  value,
  options,
  defaultValue = "all",
}: {
  label: string
  value: string
  options: FilterSelectOption[]
  defaultValue?: string
}) {
  if (value === defaultValue) return label

  return options.find((option) => option.value === value)?.label ?? label
}
