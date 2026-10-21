export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DECISION';

export interface LogData {
  postSnippet?: string;
  relevanceScore?: number;
  skipReason?: string;
  action?: string;
  error?: string;
  hourCount?: number;
  dayCount?: number;
  reactions?: number;
  comments?: number;
  [key: string]: unknown;
}

export interface LogEntry {
  ts: number;
  level: LogLevel;
  msg: string;
  data?: LogData;
}

const LOG_KEY = 'botLogs';
const MAX_LOGS = 100;

export async function appendLog(entry: LogEntry): Promise<void> {
  const result = await chrome.storage.local.get({ [LOG_KEY]: [] });
  const logs: LogEntry[] = result[LOG_KEY];
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  await chrome.storage.local.set({ [LOG_KEY]: logs });
}

export async function getLogs(): Promise<LogEntry[]> {
  const result = await chrome.storage.local.get({ [LOG_KEY]: [] });
  return result[LOG_KEY] as LogEntry[];
}

export async function clearLogs(): Promise<void> {
  await chrome.storage.local.remove(LOG_KEY);
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatEntry(level: LogLevel, msg: string, data?: LogData): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  let line = `[${ts}] [${level.padEnd(8)}] ${msg}`;
  if (data) {
    const extras = Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => {
        const str = String(v);
        return `${k}=${str.includes(' ') ? `"${str}"` : str}`;
      })
      .join(' ');
    if (extras) line += `  |  ${extras}`;
  }
  return line + '\n';
}

// ── Bot logger (content script side) ─────────────────────────────────────────

class BotLogger {
  async log(level: LogLevel, msg: string, data?: LogData): Promise<void> {
    try {
      chrome.runtime.sendMessage({ type: 'WRITE_BOT_LOG', level, msg, data });
    } catch { /* background worker may be sleeping — acceptable loss */ }
  }
}

export const botLogger = new BotLogger();
