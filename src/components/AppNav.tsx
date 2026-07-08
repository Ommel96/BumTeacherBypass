'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const ICONS = {
  home: <><path d="M3 9.5 12 3l9 6.5"/><path d="M5 8.5V21h14V8.5"/><path d="M9 21v-6h6v6"/></>,
  book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></>,
  chevron: <polyline points="9 18 15 12 9 6"/>,
} as const;

function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

const NAV: Array<{ href: string; label: string; icon: keyof typeof ICONS }> = [
  { href: '/', label: 'Start', icon: 'home' },
  { href: '/compendium', label: 'Kompendium', icon: 'book' },
  { href: '/docs', label: 'Hilfe', icon: 'help' },
  { href: '/settings', label: 'Einstellungen', icon: 'gear' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/documents');
  return pathname.startsWith(href);
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className="flex items-center gap-2.5 no-underline">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_2px_12px_rgba(139,92,246,0.5)]" style={{ background: 'var(--accent-grad)' }}>
        <Icon name="book" size={17} />
      </span>
      {!compact && (
        <span className="text-[0.95rem] font-bold tracking-tight text-white leading-tight">
          BumTeacher<span className="text-[#c4b5fd]">Bypass</span>
        </span>
      )}
    </a>
  );
}


interface DocMeta { year: string; semester: string; module_number: string }

// Lehrjahr → Semester → Modul tree, built from the documents that actually exist.
function LibraryTree({ pathname }: { pathname: string }) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/documents')
      .then(r => r.json())
      .then(data => setDocs(Array.isArray(data?.documents) ? data.documents : []))
      .catch(() => {});
  }, []);

  // Auto-expand the branch of the current route
  useEffect(() => {
    const m = pathname.match(/^\/worksheets\/year-(\d+)(?:\/semester-(\d+))?/);
    if (m) {
      setExpanded(prev => ({
        ...prev,
        [`y${m[1]}`]: true,
        ...(m[2] ? { [`y${m[1]}s${m[2]}`]: true } : {}),
      }));
    }
  }, [pathname]);

  const tree = new Map<string, Map<string, Set<string>>>();
  for (const d of docs) {
    if (!d.year) continue;
    if (!tree.has(d.year)) tree.set(d.year, new Map());
    const sems = tree.get(d.year)!;
    const sem = d.semester || '';
    if (!sems.has(sem)) sems.set(sem, new Set());
    if (d.module_number) sems.get(sem)!.add(d.module_number);
  }

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const rowCls = (active: boolean, indent: string) =>
    `flex items-center gap-2 rounded-lg ${indent} py-1.5 text-[0.82rem] font-medium no-underline transition-colors ` +
    (active ? 'bg-white/10 text-white shadow-[inset_2px_0_0_0_#a78bfa]' : 'text-[#8d94b3] hover:bg-white/5 hover:text-white');

  return (
    <nav className="mt-2 flex flex-col gap-0.5 overflow-y-auto min-h-0" aria-label="Bibliothek">
      {[1, 2, 3, 4].map(y => {
        const yKey = `y${y}`;
        const yHref = `/worksheets/year-${y}`;
        const yActive = pathname === yHref;
        const sems = tree.get(String(y));
        const hasChildren = !!sems && sems.size > 0;
        const isOpen = !!expanded[yKey];
        return (
          <div key={y}>
            <div className="flex items-center">
              <a href={yHref} className={`flex-1 ${rowCls(yActive, 'px-3')}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[0.7rem] font-bold ${yActive ? 'bg-[#a78bfa] text-[#12101f]' : 'bg-white/10 text-[#8d94b3]'}`}>{y}</span>
                {y}. Lehrjahr
              </a>
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => toggle(yKey)}
                  aria-label={isOpen ? 'Zuklappen' : 'Aufklappen'}
                  aria-expanded={isOpen}
                  className="shrink-0 p-1.5 mr-1 rounded-md text-[#5b6284] hover:text-white hover:bg-white/5 bg-transparent border-none cursor-pointer"
                >
                  <span className={`block transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}><Icon name="chevron" size={13} /></span>
                </button>
              )}
            </div>
            {hasChildren && isOpen && (
              <div className="ml-3 border-l border-white/10 pl-1 flex flex-col gap-0.5 mt-0.5">
                {Array.from(sems!.keys()).sort().map(sem => {
                  const sKey = `y${y}s${sem}`;
                  const sHref = `${yHref}/semester-${sem}`;
                  const sActive = pathname === sHref;
                  const modules = Array.from(sems!.get(sem) || []).sort();
                  const sOpen = !!expanded[sKey];
                  return (
                    <div key={sem}>
                      <div className="flex items-center">
                        <a href={sHref} className={`flex-1 ${rowCls(sActive, 'px-2.5')}`}>
                          Semester {sem || '?'}
                        </a>
                        {modules.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggle(sKey)}
                            aria-label={sOpen ? 'Zuklappen' : 'Aufklappen'}
                            aria-expanded={sOpen}
                            className="shrink-0 p-1 mr-1 rounded-md text-[#5b6284] hover:text-white hover:bg-white/5 bg-transparent border-none cursor-pointer"
                          >
                            <span className={`block transition-transform duration-200 ${sOpen ? 'rotate-90' : ''}`}><Icon name="chevron" size={12} /></span>
                          </button>
                        )}
                      </div>
                      {sOpen && modules.length > 0 && (
                        <div className="ml-2.5 border-l border-white/10 pl-1 flex flex-col gap-0.5 mt-0.5">
                          {modules.map(mod => {
                            const mHref = `${sHref}/${mod}`;
                            const mActive = pathname.startsWith(mHref);
                            return (
                              <a key={mod} href={mHref} className={rowCls(mActive, 'px-2.5')}>
                                <span className="text-[#5b6284]">▸</span> Modul {mod}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function AppNav() {
  const pathname = usePathname() || '/';

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col px-4 py-5" style={{ background: 'linear-gradient(180deg, #12101f 0%, #170f2a 100%)' }}>
        <div className="px-1 mb-8"><Logo /></div>

        <nav className="flex flex-col gap-1" aria-label="Hauptnavigation">
          {NAV.map(item => {
            const active = isActive(pathname, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium no-underline transition-colors ${
                  active
                    ? 'bg-white/10 text-white shadow-[inset_2px_0_0_0_#a78bfa]'
                    : 'text-[#8d94b3] hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className={active ? 'text-[#c4b5fd]' : ''}><Icon name={item.icon} /></span>
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="mt-7 px-3 text-[0.65rem] font-semibold uppercase tracking-wider text-[#5b6284]">Bibliothek</div>
        <LibraryTree pathname={pathname} />

        <div className="mt-auto">
          <a
            href="/?upload=1"
            className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white no-underline shadow-[0_4px_16px_rgba(139,92,246,0.45)] hover:shadow-[0_6px_22px_rgba(139,92,246,0.6)] hover:-translate-y-px transition-all"
            style={{ background: 'var(--accent-grad)' }}
          >
            <Icon name="upload" size={16} />
            Dokument hochladen
          </a>
          <div className="mt-4 px-1 text-[0.65rem] text-[#5b6284]">Interaktive Arbeitsblätter</div>
        </div>
      </aside>

      {/* ── Mobile top bar ── */}
      <header className="lg:hidden sticky top-0 z-40 border-b border-[var(--border)] bg-white/75 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 py-2.5">
          <a href="/" className="flex items-center gap-2 no-underline">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-[0_2px_10px_rgba(139,92,246,0.4)]" style={{ background: 'var(--accent-grad)' }}>
              <Icon name="book" size={15} />
            </span>
            <span className="text-sm font-bold tracking-tight text-[var(--text)]">BumTeacher<span className="text-[var(--accent)]">Bypass</span></span>
          </a>
          <a href="/?upload=1" aria-label="Dokument hochladen" className="flex h-8 w-8 items-center justify-center rounded-lg text-white no-underline shadow-[0_2px_10px_rgba(139,92,246,0.4)]" style={{ background: 'var(--accent-grad)' }}>
            <Icon name="upload" size={15} />
          </a>
        </div>
      </header>

      {/* ── Mobile bottom tabs ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--border)] bg-white/85 backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Hauptnavigation">
        <div className="grid grid-cols-4">
          {NAV.map(item => {
            const active = isActive(pathname, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-medium no-underline ${active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>
    </>
  );
}
