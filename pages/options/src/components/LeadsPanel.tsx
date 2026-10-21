import { useEffect, useMemo, useState } from 'react';
import {
  facebookBotConfigStorage,
  FACEBOOK_DEFAULTS,
  type FacebookBotConfig,
  type SavedLead,
} from '@extension/storage';

const PAGE_SIZE = 20;

function confidenceColor(c: number): string {
  if (c >= 0.85) return 'text-green-400';
  if (c >= 0.7) return 'text-yellow-400';
  return 'text-orange-400';
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toCsv(leads: SavedLead[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ['url', 'confidence_percent', 'snippet', 'reason', 'saved_at'];
  const rows = leads.map(l =>
    [
      esc(l.url),
      String(Math.round(l.confidence * 100)),
      esc(l.snippet),
      esc(l.reason),
      esc(new Date(l.savedAt).toISOString()),
    ].join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

export function LeadsPanel() {
  // ── Config (Hungry Lead Finder) ──────────────────────────────────────
  const [config, setConfig] = useState<FacebookBotConfig>(FACEBOOK_DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    facebookBotConfigStorage.get().then(setConfig);
  }, []);

  const update = (patch: Partial<FacebookBotConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
    setSaveStatus('idle');
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await facebookBotConfigStorage.set(config);
      setIsDirty(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  // ── Saved leads ──────────────────────────────────────────────────────
  // TODO(functionality phase): subscribe to savedLeadsStorage.
  const [leads, setLeads] = useState<SavedLead[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const sorted = useMemo(
    () => [...leads].sort((a, b) => b.confidence - a.confidence),
    [leads],
  );
  const visible = sorted.slice(0, visibleCount);

  const handleDownloadCsv = () => {
    const blob = new Blob([toCsv(sorted)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facebook-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    if (sorted.length === 0) return;
    if (!window.confirm(`Delete all ${sorted.length} saved leads? This cannot be undone.`)) return;
    // TODO(functionality phase): savedLeadsStorage.set([]).
    setLeads([]);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-700 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Lead Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Configure the Hungry Lead Finder and review the posts it flagged.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!isDirty || saveStatus === 'saving'}
          className={[
            'px-4 py-2 rounded-md text-sm font-medium transition-colors',
            isDirty && saveStatus !== 'saving'
              ? 'bg-blue-600 hover:bg-blue-500 text-white'
              : saveStatus === 'saved'
                ? 'bg-green-700 text-white cursor-default'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed',
          ].join(' ')}>
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save changes'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Config section ──────────────────────────────────────── */}
        <div className="px-8 py-6 border-b border-gray-700">
          <div className="max-w-2xl space-y-4">
            <p className="text-xs font-semibold text-gray-400 tracking-wide">Hungry Lead Finder</p>

            <label className="flex items-center gap-3 px-3 py-2 rounded-md border border-gray-700 bg-gray-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={config.hungryLeadFinder}
                onChange={e => update({ hungryLeadFinder: e.target.checked })}
                className="accent-blue-500"
              />
              <span className="text-sm text-white font-medium">Enable Hungry Lead Finder mode</span>
            </label>
            <p className="text-xs text-gray-500">
              When on, <span className="text-gray-300">every post is sent to the LLM</span> — engagement
              and skip filters are ignored — so no potential lead is missed.
            </p>

            {config.hungryLeadFinder && (
              <div className="space-y-4 border-l-2 border-blue-500/40 pl-4">
                <label className="flex items-center gap-3 px-3 py-2 rounded-md border border-gray-700 bg-gray-800/40 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.commentWhileHunting}
                    onChange={e => update({ commentWhileHunting: e.target.checked })}
                    className="accent-blue-500"
                  />
                  <span className="text-sm text-gray-200">
                    Keep commenting / liking / sharing as usual while hunting
                  </span>
                </label>
                <p className="text-xs text-gray-500 -mt-2">
                  Uncheck for scan-only mode — the bot just collects leads and takes no actions.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Save post link if it matches
                  </label>
                  <textarea
                    value={config.leadCriteria}
                    onChange={e => update({ leadCriteria: e.target.value })}
                    rows={4}
                    className="textarea"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Describe what makes a post a lead. The LLM scores each post against this.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">
                    Save when confidence ≥ {config.leadConfidenceThreshold}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={config.leadConfidenceThreshold}
                    onChange={e => update({ leadConfidenceThreshold: Number(e.target.value) })}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    A post link is saved only when the lead confidence meets this threshold.
                  </p>
                </div>
              </div>
            )}
            {saveStatus === 'error' && (
              <p className="text-sm text-red-400">Failed to save. Please try again.</p>
            )}
          </div>
        </div>

        {/* ── Saved leads list ────────────────────────────────────── */}
        <div className="flex items-center px-8 py-3 border-b border-gray-700">
          <span className="text-sm font-semibold text-white">Saved leads</span>
          <span className="ml-3 text-xs text-gray-500">
            {sorted.length} saved · highest confidence first
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleClearAll}
              disabled={sorted.length === 0}
              className={[
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                sorted.length === 0
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-red-900/60 hover:bg-red-800/60 text-red-300',
              ].join(' ')}>
              Clear all
            </button>
            <button
              onClick={handleDownloadCsv}
              disabled={sorted.length === 0}
              className={[
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                sorted.length === 0
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white',
              ].join(' ')}>
              Download CSV
            </button>
          </div>
        </div>

        <div className="px-8 py-4 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-gray-600 text-center mt-12">No leads saved yet.</p>
          ) : (
            <>
              {visible.map((lead, i) => (
                <div
                  key={`${lead.url}-${i}`}
                  className="rounded-md border border-gray-700 bg-gray-800/40 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={`shrink-0 text-sm font-bold tabular-nums ${confidenceColor(lead.confidence)}`}>
                      {Math.round(lead.confidence * 100)}%
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={lead.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-400 hover:text-blue-300 hover:underline break-all">
                        {lead.url}
                      </a>
                      <p className="text-sm text-gray-300 mt-1">{lead.snippet}</p>
                      <p className="text-xs text-gray-500 mt-1 italic">{lead.reason}</p>
                      <p className="text-xs text-gray-600 mt-1">{formatDate(lead.savedAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {visibleCount < sorted.length && (
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="w-full mt-2 px-4 py-2 rounded-md text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">
                  Load more ({sorted.length - visibleCount} remaining)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
