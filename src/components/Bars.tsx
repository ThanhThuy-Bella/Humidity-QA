/** Biểu đồ cột ngang đơn giản (thay Databar / Pivot chart Excel) – không cần thư viện */
export function HBars({ rows, max, unit = "", color = "#1693B5" }: { rows: { label: string; value: number; note?: string }[]; max?: number; unit?: string; color?: string }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[90px_1fr_64px] items-center gap-2 text-sm">
          <span className="truncate font-medium">{r.label}</span>
          <div className="h-3.5 bg-[#EDF1F3] rounded-sm overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${(r.value / m) * 100}%`, background: color }} />
          </div>
          <span className="text-right tabular-nums text-mute">{r.note ?? `${r.value}${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

/** Cột dọc theo tháng: avg + max độ ẩm, vạch ngưỡng */
export function MonthColumns({ data, limit }: { data: { month: string; avg: number; max: number; lots: number }[]; limit: number }) {
  const top = Math.max(limit + 1, ...data.map((d) => d.max));
  const h = 160;
  const y = (v: number) => h - (v / top) * h;
  const w = 44;
  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(320, data.length * w + 40)} height={h + 40} role="img" aria-label="Độ ẩm trung bình và cao nhất theo tháng">
        <line x1={30} x2={data.length * w + 36} y1={y(limit)} y2={y(limit)} stroke="#D64545" strokeDasharray="4 3" />
        <text x={32} y={y(limit) - 4} fontSize="10" fill="#D64545">Ngưỡng {limit}%</text>
        {data.map((d, i) => {
          const x = 36 + i * w;
          return (
            <g key={d.month}>
              <rect x={x} y={y(d.max)} width={14} height={h - y(d.max)} fill="#D6EEF5" />
              <rect x={x + 16} y={y(d.avg)} width={14} height={h - y(d.avg)} fill="#1693B5" />
              <text x={x + 15} y={h + 14} fontSize="10" textAnchor="middle" fill="#4A5A66">{d.month.slice(5)}/{d.month.slice(2, 4)}</text>
              <text x={x + 15} y={h + 27} fontSize="9" textAnchor="middle" fill="#4A5A66">{d.lots} lô</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 text-xs text-mute mt-1">
        <span><span className="inline-block w-3 h-3 align-middle bg-teal mr-1" />Trung bình</span>
        <span><span className="inline-block w-3 h-3 align-middle bg-teal-soft mr-1" />Cao nhất</span>
      </div>
    </div>
  );
}
