interface CardProps {
  title: string;
  value: string;
  sub?: string;
}

export function Card({ title, value, sub }: CardProps) {
  return (
    <div className="panel-block">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}
