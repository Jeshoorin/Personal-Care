interface ProgressMeterProps {
  label: string;
  value: number;
}

export function ProgressMeter({ label, value }: ProgressMeterProps) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-semibold text-ink">{safeValue}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-[#13b27b]"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}
