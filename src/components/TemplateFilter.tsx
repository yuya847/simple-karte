interface Props {
  options: { id: string; name: string; count: number }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function TemplateFilter({ options, selected, onChange }: Props) {
  return <span role="group" aria-label="テンプレート" className="flex w-full flex-wrap items-center gap-2">
    <span className="text-ink-faint">テンプレート</span>
    {options.filter((t) => t.count > 0).map((t) => <label key={t.id} className="nums flex cursor-pointer items-center gap-0.5">
      <input type="checkbox" checked={selected.includes(t.id)} className="accent-ai" onChange={() => onChange(selected.includes(t.id) ? selected.filter((id) => id !== t.id) : [...selected, t.id])} />
      {t.name}<span className="text-ink-faint">{t.count}件</span>
    </label>)}
    {options.length === 0 && <span className="text-ink-faint">テンプレートの記事はありません</span>}
  </span>;
}
