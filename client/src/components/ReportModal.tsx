export default function ReportModal({
  open, onClose, reportMd, date,
}: {
  open: boolean; onClose: () => void; reportMd: string; date: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">📄 Тижневий Макро Звіт</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{date}</p>
          </div>
          <button data-testid="btn-close-modal" onClick={onClose} className="p-2 rounded-lg hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-6">
          {reportMd
            ? <pre className="text-xs text-[hsl(var(--muted-foreground))] whitespace-pre-wrap font-mono leading-relaxed">{reportMd}</pre>
            : <p className="text-sm text-[hsl(var(--muted-foreground))]">Завантаження звіту...</p>}
        </div>
      </div>
    </div>
  );
}
