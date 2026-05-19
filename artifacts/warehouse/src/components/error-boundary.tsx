import { Component, type ErrorInfo, type ReactNode } from "react";

// Top-level safety net so a render error in one screen doesn't blank out the
// entire warehouse app and leave the operator stranded mid-receive.
type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught", error, info.componentStack);
  }

  handleReload = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-6">
          <div className="max-w-md w-full bg-zinc-900 rounded-lg border border-zinc-800 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 text-xl">!</div>
              <div>
                <h1 className="text-lg font-semibold">Something went wrong</h1>
                <p className="text-sm text-zinc-400">The warehouse screen hit an unexpected error.</p>
              </div>
            </div>
            <pre className="text-xs bg-zinc-950 text-zinc-300 rounded p-3 overflow-auto max-h-40 whitespace-pre-wrap border border-zinc-800">
              {this.state.error.message}
            </pre>
            <button onClick={this.handleReload} className="w-full px-4 py-2 rounded-md bg-amber-400 text-zinc-950 text-sm font-semibold hover:bg-amber-300">
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
