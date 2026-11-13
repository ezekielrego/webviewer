import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  EyeOff,
  Home,
  Maximize2,
  Minimize2,
  RotateCw,
} from 'lucide-react';

interface ViewerToolbarProps {
  inputUrl: string;
  currentUrl: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  isFullscreen: boolean;
  onInputChange: (value: string) => void;
  onSubmitUrl: (e: React.FormEvent) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onResetDefault: () => void;
  onHideToolbar: () => void;
  onToggleFullscreen: () => void;
}

export function ViewerToolbar({
  inputUrl,
  currentUrl,
  canGoBack,
  canGoForward,
  isLoading,
  isFullscreen,
  onInputChange,
  onSubmitUrl,
  onBack,
  onForward,
  onReload,
  onResetDefault,
  onHideToolbar,
  onToggleFullscreen,
}: ViewerToolbarProps) {
  return (
    <header className="relative z-20 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#111317] px-3 py-2 text-zinc-200 sm:h-12 sm:flex-nowrap sm:justify-start sm:gap-3 sm:px-4 sm:py-0">
      <nav aria-label="Browser navigation" className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Go back"
          title="Back"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-35"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onForward}
          disabled={!canGoForward}
          aria-label="Go forward"
          title="Forward"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-35"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onReload}
          aria-label="Reload page"
          title="Reload"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
        </button>
        <button
          type="button"
          onClick={onResetDefault}
          aria-label="Reset to default Marble project"
          title="Default Marble Project"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Home className="h-4 w-4" />
        </button>
      </nav>

      <form
        onSubmit={onSubmitUrl}
        className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:w-auto sm:flex-1"
      >
        <label htmlFor="viewer-url-input" className="sr-only">
          Target URL
        </label>
        <input
          id="viewer-url-input"
          type="text"
          value={inputUrl}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Enter URL (e.g. https://marble.worldlabs.ai/project/...)"
          spellCheck={false}
          autoComplete="off"
          className="font-mono-url h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-[#1B1E24] px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none sm:text-[13px]"
        />
        <button
          type="submit"
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-blue-600 px-3.5 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Go
        </button>
      </form>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onHideToolbar}
          aria-label="Hide viewer toolbar"
          title="Pure Viewer Mode (Hide Toolbar)"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <EyeOff className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          className="hidden h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500 sm:inline-flex"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original URL in new tab"
          title="Open Original URL"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {isLoading && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-0 left-0 h-0.5 overflow-hidden bg-white/5"
        >
          <div className="h-full w-1/2 origin-left animate-pulse bg-blue-500" />
        </div>
      )}
    </header>
  );
}
