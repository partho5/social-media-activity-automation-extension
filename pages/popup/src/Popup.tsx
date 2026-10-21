import '@src/Popup.css';
import { t } from '@extension/i18n';
import { PROJECT_URL_OBJECT, useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage, facebookBotConfigStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const { enabled: facebookEnabled } = useStorage(facebookBotConfigStorage);

  const logo = isLight ? 'popup/logo_vertical.svg' : 'popup/logo_vertical_dark.svg';
  const bgColor = isLight ? 'bg-slate-50' : 'bg-gray-800';
  const textColor = isLight ? 'text-gray-900' : 'text-gray-100';
  const cardBg = isLight ? 'bg-white border-gray-200' : 'bg-gray-700 border-gray-600';
  const statusColor = facebookEnabled ? 'text-green-500' : 'text-gray-400';

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  const openOptionsPage = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className={cn('h-full min-h-96 p-4', bgColor, textColor)}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={goGithubSite} className="hover:opacity-80 transition-opacity">
            <img src={chrome.runtime.getURL(logo)} className="h-8" alt="logo" />
          </button>
          <ToggleButton>{t('toggleTheme')}</ToggleButton>
        </div>

        {/* Status Card */}
        <div className={cn('p-3 rounded border', cardBg)}>
          <div className="text-xs font-semibold text-gray-400 mb-2">AUTOMATION STATUS</div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Facebook</span>
            <div className={cn('w-2 h-2 rounded-full', statusColor, facebookEnabled ? 'bg-green-500' : 'bg-gray-400')} />
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            onClick={openOptionsPage}
            className={cn(
              'w-full py-2 px-3 rounded text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 transition-colors',
            )}>
            Configure
          </button>
        </div>

        {/* Footer */}
        <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-600">
          Right-click an element on Facebook to add to automation
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
