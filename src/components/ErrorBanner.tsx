import {AlertCircle} from 'lucide-react';

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
  onResetDefault: () => void;
}

export function ErrorBanner({
  message,
  onDismiss,
  onResetDefault,
}: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-red-500/30 bg-red-950/60 px-4 py-2.5 text-sm text-red-100"
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
        <span>{message}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onResetDefault}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white whitespace-nowrap transition-colors hover:bg-red-500"
        >
          Return to Marble Project
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-zinc-200 whitespace-nowrap transition-colors hover:bg-white/10"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
