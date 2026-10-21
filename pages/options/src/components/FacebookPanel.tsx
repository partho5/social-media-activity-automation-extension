import { useState, useEffect } from 'react';
import {
  facebookBotConfigStorage,
  FACEBOOK_DEFAULTS,
  ALL_STYLES,
  type FacebookBotConfig,
  type CommentStyle,
  type SpeedFactor,
} from '@extension/storage';
import { AnalyticsPanel } from './AnalyticsPanel';
import { LeadsPanel } from './LeadsPanel';

type Tab = 'settings' | 'analytics' | 'leads';

export function FacebookPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('settings');
  const [config, setConfig] = useState<FacebookBotConfig>(FACEBOOK_DEFAULTS);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => {
    facebookBotConfigStorage.get().then(c => setConfig(c));
  }, []);

  const update = (patch: Partial<FacebookBotConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setIsDirty(true);
    setSaveStatus('idle');
  };

  const toggleStyle = (style: CommentStyle) => {
    const has = config.styles.includes(style);
    const next = has ? config.styles.filter(s => s !== style) : [...config.styles, style];
    update({ styles: next });
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-700 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Facebook</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Simple hints — the system turns them into a robust prompt.
          </p>
        </div>
        {activeTab === 'settings' && (
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
        )}
      </div>

      {/* Tab bar */}
      <div className="flex px-8 border-b border-gray-700 shrink-0">
        {(['settings', 'analytics', 'leads'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
              activeTab === tab
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200',
            ].join(' ')}>
            {tab === 'leads' ? 'Lead Management' : tab}
          </button>
        ))}
      </div>

      {/* Analytics tab */}
      {activeTab === 'analytics' && <AnalyticsPanel />}

      {/* Leads tab */}
      {activeTab === 'leads' && <LeadsPanel />}

      {/* Settings tab */}
      {activeTab === 'settings' && <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl space-y-6">
          {/* ── Identity ───────────────────────────────────── */}
          <Section title="Identity">
            <Field label="Persona" hint="Who the bot presents itself as.">
              <input
                type="text"
                value={config.persona}
                onChange={e => update({ persona: e.target.value })}
                className="input"
              />
            </Field>

            <Field label="Topic" hint="What kind of posts this bot is built around.">
              <input
                type="text"
                value={config.topic}
                onChange={e => update({ topic: e.target.value })}
                className="input"
              />
            </Field>

            <Field label="Language" hint="The language the bot writes replies in.">
              <input
                type="text"
                value={config.language}
                onChange={e => update({ language: e.target.value })}
                className="input"
              />
            </Field>

            <Field label="Tone hint" hint="A short cue for the bot's overall feel.">
              <input
                type="text"
                value={config.tone}
                onChange={e => update({ tone: e.target.value })}
                className="input"
              />
            </Field>
          </Section>

          {/* ── Engagement ─────────────────────────────────── */}
          <Section title="Engagement">
            <Field
              label="Engage when"
              hint="Describe the posts you want the bot to comment on. Plain language is fine.">
              <textarea
                value={config.engageWhen}
                onChange={e => update({ engageWhen: e.target.value })}
                rows={4}
                className="textarea"
              />
            </Field>

            <Field
              label="Skip when"
              hint="Describe the posts you want the bot to ignore.">
              <textarea
                value={config.skipWhen}
                onChange={e => update({ skipWhen: e.target.value })}
                rows={4}
                className="textarea"
              />
            </Field>
          </Section>

          {/* ── Comment styles ──────────────────────────────── */}
          <Section title="Comment styles">
            <p className="text-sm text-gray-500 mb-3">
              Pick which voices the bot is allowed to use. The bot picks the right one per post.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_STYLES.map(style => {
                const checked = config.styles.includes(style);
                return (
                  <label
                    key={style}
                    className={[
                      'flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer transition-colors',
                      checked
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-600',
                    ].join(' ')}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStyle(style)}
                      className="accent-blue-500"
                    />
                    <span className="capitalize">{style}</span>
                  </label>
                );
              })}
            </div>
          </Section>

          {/* ── Speed ───────────────────────────────────────── */}
          <Section title="Pacing">
            <Field
              label={`Speed factor: ${config.speedFactor}`}
              hint="1 = slow & cautious, 5 = fast & aggressive. Controls delay ranges between actions.">
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={config.speedFactor}
                onChange={e => update({ speedFactor: Number(e.target.value) as SpeedFactor })}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-sm text-gray-500 mt-1">
                <span>Slow</span>
                <span>Fast</span>
              </div>
            </Field>
          </Section>

          {/* ── Rate limits ─────────────────────────────────── */}
          <Section title="Rate limits">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Max comments / hour"
                hint="Bot stops commenting for the rest of the hour once this is hit. Set 0 to disable.">
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={config.maxCommentsPerHour}
                  onChange={e => update({ maxCommentsPerHour: Math.max(0, Number(e.target.value)) })}
                  className="input"
                />
              </Field>

              <Field
                label="Max comments / day"
                hint="Bot stops for the rest of the day once this is hit. Resets at midnight. Set 0 to disable.">
                <input
                  type="number"
                  min={0}
                  max={5000}
                  value={config.maxCommentsPerDay}
                  onChange={e => update({ maxCommentsPerDay: Math.max(0, Number(e.target.value)) })}
                  className="input"
                />
              </Field>
            </div>
          </Section>

          {/* Hungry Lead Finder config now lives in the Lead Management tab. */}

          {/* ── Engagement filter ───────────────────────────── */}
          <Section title="Engagement filter">
            <p className="text-sm text-gray-500 mb-3">Only comment when a post already has:</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-base">👍</span>
                <span className="text-sm text-gray-300 whitespace-nowrap min-w-[130px]">reactions ≥</span>
                <input
                  type="number"
                  min={0}
                  value={config.minReactions}
                  onChange={e => update({ minReactions: Math.max(0, Number(e.target.value)) })}
                  className="input w-24"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-base">💬</span>
                <span className="text-sm text-gray-300 whitespace-nowrap min-w-[130px]">comments ≥</span>
                <input
                  type="number"
                  min={0}
                  value={config.minComments}
                  onChange={e => update({ minComments: Math.max(0, Number(e.target.value)) })}
                  className="input w-24"
                />
              </div>
            </div>
          </Section>
        </div>
      </div>}

      {saveStatus === 'error' && activeTab === 'settings' && (
        <div className="px-8 py-3 bg-red-900/40 border-t border-red-700 text-sm text-red-300">
          Failed to save. Please try again.
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-700 pt-5 first:border-t-0 first:pt-0">
      <p className="text-sm font-semibold text-gray-400 tracking-wide mb-4">{title}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-200 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
    </div>
  );
}
