import 'webextension-polyfill';
import { createClerkClient } from '@clerk/chrome-extension/background';
import { appendLog, type LogLevel, type LogData } from '@extension/shared';

const PUBLISHABLE_KEY = process.env['CEB_CLERK_PUBLISHABLE_KEY'] ?? '';
const SYNC_HOST = process.env['CEB_BACKEND_URL'] ?? 'https://linkedin-growth-api-server.vercel.app';

let clerk: Awaited<ReturnType<typeof createClerkClient>> | null = null;

async function getClerk() {
  if (clerk) return clerk;
  if (!PUBLISHABLE_KEY) throw new Error('CEB_CLERK_PUBLISHABLE_KEY not set');
  clerk = await createClerkClient({ publishableKey: PUBLISHABLE_KEY, syncHost: SYNC_HOST });
  console.log('[Background] Clerk loaded, user:', clerk.user?.id ?? 'none');
  return clerk;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch(err => {
    console.error('[Background] Message error:', err);
    sendResponse({ error: String(err) });
  });
  return true;
});

/** Open a URL in a background tab, extract its main text content, then close the tab. */
async function fetchLinkText(url: string): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('FETCH_LINK_TEXT: non-http URL');

  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id!;

  // Wait for the tab to finish loading (or timeout after 20 s)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('FETCH_LINK_TEXT: tab load timeout'));
    }, 20000);

    function onUpdated(changedId: number, info: chrome.tabs.TabChangeInfo) {
      if (changedId !== tabId) return;
      if (info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(onUpdated);

    // Tab might already be complete by the time we add the listener
    chrome.tabs.get(tabId).then(t => {
      if (t.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    });
  });

  let text = '';
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const containers = document.querySelectorAll('div, article, section');
        let longestText = '';
        containers.forEach(el => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetParent === null || el.tagName === 'BODY' || el.tagName === 'HTML') return;
          const t = htmlEl.innerText?.replace(/\s+/g, ' ').trim() ?? '';
          if (t.length > longestText.length && el.querySelectorAll('p').length > 2) {
            longestText = t;
          }
        });
        return longestText.substring(0, 1200);
      },
    });
    text = (results[0]?.result as string) ?? '';
  } finally {
    await chrome.tabs.remove(tabId).catch(() => {});
  }

  return text;
}

async function handleMessage(message: { type: string; url?: string; level?: string; msg?: string; data?: unknown }): Promise<unknown> {
  if (message.type === 'WRITE_BOT_LOG') {
    if (!message.level || !message.msg) return { ok: false };
    try {
      await appendLog({ ts: Date.now(), level: message.level as LogLevel, msg: message.msg, data: message.data as LogData | undefined });
    } catch { /* storage unavailable — acceptable loss */ }
    return { ok: true };
  }

  // Image fetch handled before Clerk init — no auth needed.
  if (message.type === 'FETCH_IMAGE') {
    if (!message.url) throw new Error('FETCH_IMAGE: missing url');
    const u = new URL(message.url); // throws if malformed
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('FETCH_IMAGE: non-http URL');
    const response = await fetch(message.url);
    if (!response.ok) throw new Error(`FETCH_IMAGE: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Build base64 in 8 KB chunks to avoid call-stack overflow on large images.
    const CHUNK = 8192;
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(parts.join(''));
    const mime = (response.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
    return { dataUrl: `data:${mime};base64,${base64}` };
  }

  const c = await getClerk();

  switch (message.type) {
    case 'CLERK_GET_USER': {
      // Re-load to pick up any session synced from the web app since startup
      await c.load({ syncHost: SYNC_HOST });
      if (!c.user) return { user: null };
      const { id, primaryEmailAddress, firstName, lastName } = c.user;
      return {
        user: {
          id,
          email: primaryEmailAddress?.emailAddress ?? null,
          firstName: firstName ?? null,
          lastName: lastName ?? null,
        },
      };
    }

    case 'CLERK_GET_TOKEN': {
      const token = (await c.session?.getToken()) ?? null;
      return { token };
    }

    case 'CLERK_SIGN_OUT': {
      await c.signOut();
      clerk = null; // force re-init on next call
      return { success: true };
    }

    case 'CLERK_SIGN_IN_URL': {
      return { url: `${SYNC_HOST}/sign-in` };
    }

    case 'FETCH_LINK_TEXT': {
      if (!message.url) throw new Error('FETCH_LINK_TEXT: missing url');
      const text = await fetchLinkText(message.url);
      return { text };
    }

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// Pre-warm on service worker startup
getClerk().catch(err => console.warn('[Background] Clerk init failed:', err));
