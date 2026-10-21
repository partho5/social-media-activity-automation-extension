import { useState, useEffect, useCallback } from 'react';
import { getLogs, clearLogs, type LogEntry, type LogLevel } from '@extension/shared';

const LEVEL_COLORS: Record<LogLevel, string> = {
  INFO: 'text-blue-400',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400',
  DECISION: 'text-green-400',
};

function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function AnalyticsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');

  const refresh = useCallback(() => {
    getLogs().then(entries => setLogs([...entries].reverse()));
  }, []);

  useEffect(() => {
    refresh();
    const onChange = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && 'botLogs' in changes) refresh();
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [refresh]);

  const handleClear = async () => {
    await clearLogs();
    setLogs([]);
  };

  const visible = filter === 'ALL' ? logs : logs.filter(e => e.level === filter);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-700 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">Last 100 bot activity logs.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="px-3 py-1.5 rounded-md text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors">
            Refresh
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded-md text-sm bg-red-900/60 hover:bg-red-800/60 text-red-300 transition-colors">
            Clear
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-1 px-8 py-3 border-b border-gray-700 shrink-0">
        {(['ALL', 'INFO', 'DECISION', 'WARN', 'ERROR'] as const).map(lvl => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={[
              'px-3 py-1 rounded text-xs font-medium transition-colors',
              filter === lvl
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700',
            ].join(' ')}>
            {lvl}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500 self-center">{visible.length} entries</span>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto px-8 py-4 font-mono text-xs space-y-1">
        {visible.length === 0 ? (
          <p className="text-gray-600 text-center mt-12">No logs yet.</p>
        ) : (
          visible.map((entry, i) => (
            <div key={i} className="flex gap-3 py-1 border-b border-gray-800/50">
              <span className="text-gray-600 shrink-0">{formatTs(entry.ts)}</span>
              <span className={`shrink-0 w-16 ${LEVEL_COLORS[entry.level]}`}>{entry.level}</span>
              <span className="text-gray-300 break-all">
                {entry.msg}
                {entry.data && (
                  <span className="text-gray-500 ml-2">
                    {Object.entries(entry.data)
                      .filter(([, v]) => v !== undefined && v !== null)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(' ')}
                  </span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
