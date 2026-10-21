import '@src/Options.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { useEffect, useState } from 'react';
import { Sidebar } from '@src/components/Sidebar';
import { FacebookPanel } from '@src/components/FacebookPanel';

// ─── Auth hook ────────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

function useBackgroundAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Query background worker for current user
    chrome.runtime.sendMessage({ type: 'CLERK_GET_USER' }, response => {
      if (response?.user) {
        setUser(response.user);
      }
      setIsLoaded(true);
    });

    // Poll for auth state changes (when user signs in from another tab)
    const pollInterval = setInterval(() => {
      chrome.runtime.sendMessage({ type: 'CLERK_GET_USER' }, response => {
        setUser(response?.user ?? null);
      });
    }, 2000);

    return () => clearInterval(pollInterval);
  }, []);

  const signIn = async () => {
    const response = await new Promise<{ url: string }>(resolve => {
      chrome.runtime.sendMessage({ type: 'CLERK_SIGN_IN_URL' }, resolve);
    });

    if (response?.url) {
      chrome.tabs.create({ url: response.url });
    }
  };

  const signOut = () => {
    chrome.runtime.sendMessage({ type: 'CLERK_SIGN_OUT' }, () => {
      setUser(null);
    });
  };

  return { user, isLoaded, signIn, signOut };
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

function TopBar({ user, onSignOut }: { user: AuthUser | null; onSignOut: () => void }) {
  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 bg-gray-900 border-b border-gray-700">
      <span className="text-sm font-semibold text-white tracking-wide">Social Media Automator</span>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="text-xs text-gray-400">{user.email}</span>
            <button
              onClick={onSignOut}
              className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors">
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}

// ─── Sign-in screen ───────────────────────────────────────────────────────────

function SignInScreen({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-950 text-white">
      <div className="text-center space-y-4 max-w-sm">
        <h2 className="text-xl font-semibold">Sign in to continue</h2>
        <p className="text-sm text-gray-400">
          You need an account to configure and run automations.
        </p>
        <button
          onClick={onSignIn}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors">
          Sign in
        </button>
      </div>
    </div>
  );
}

// ─── Main app shell ───────────────────────────────────────────────────────────

function AppShell({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [selectedPlatform, setSelectedPlatform] = useState('facebook');

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      <TopBar user={user} onSignOut={onSignOut} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar selected={selectedPlatform} onSelect={setSelectedPlatform} />
        <main className="flex-1 overflow-hidden">
          {selectedPlatform === 'facebook' && <FacebookPanel />}
        </main>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const Options = () => {
  const { user, isLoaded, signIn, signOut } = useBackgroundAuth();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <LoadingSpinner />
      </div>
    );
  }

  return user ? (
    <AppShell user={user} onSignOut={signOut} />
  ) : (
    <SignInScreen onSignIn={signIn} />
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);
