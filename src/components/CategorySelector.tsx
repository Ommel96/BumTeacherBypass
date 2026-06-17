'use client';

const YEAR_OPTIONS = [
  { value: '1', label: '1. Lehrjahr' },
  { value: '2', label: '2. Lehrjahr' },
  { value: '3', label: '3. Lehrjahr' },
  { value: '4', label: '4. Lehrjahr' },
];

const SEMESTER_OPTIONS = [
  { value: '1', label: 'Semester 1' },
  { value: '2', label: 'Semester 2' },
];

export { YEAR_OPTIONS, SEMESTER_OPTIONS };

export default function CategorySelector({
  year,
  semester,
  moduleNumber,
  topic,
  onYearChange,
  onSemesterChange,
  onModuleNumberChange,
  onTopicChange,
}: {
  year: string;
  semester: string;
  moduleNumber: string;
  topic: string;
  onYearChange: (value: string) => void;
  onSemesterChange: (value: string) => void;
  onModuleNumberChange: (value: string) => void;
  onTopicChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div>
        <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Lehrjahr</label>
        <select value={year} onChange={e => onYearChange(e.target.value)} className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm">
          <option value="">-- Lehrjahr --</option>
          {YEAR_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Semester</label>
        <select value={semester} onChange={e => onSemesterChange(e.target.value)} className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm">
          <option value="">-- Semester --</option>
          {SEMESTER_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Modul</label>
        <input
          type="text"
          value={moduleNumber}
          onChange={e => onModuleNumberChange(e.target.value)}
          placeholder="z.B. 114"
          className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Thema</label>
        <input
          type="text"
          value={topic}
          onChange={e => onTopicChange(e.target.value)}
          placeholder="z.B. codierung"
          className="w-full p-2.5 border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-sm"
        />
      </div>
    </div>
  );
}