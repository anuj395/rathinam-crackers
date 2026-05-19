import { Component, type ErrorInfo, type ReactNode } from "react";

// Top-level safety net so a render error in one screen doesn't blank out the
// entire ERP. Without this, a single thrown exception inside a Card or Table
// takes down the whole app and the user sees a white page with no recourse.
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

  handleHome = (): void => {
    this.setState({ error: null });
    const base = (import.meta as unknown as { env: { BASE_URL?: string } }).env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.location.href = `${base}/`;
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md border border-zinc-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-xl">!</div>
              <div>
                <h1 className="text-lg font-semibold text-zinc-900">Something went wrong</h1>
                <p className="text-sm text-zinc-500">The page hit an unexpected error.</p>
              </div>
            </div>
            <pre className="text-xs bg-zinc-100 text-zinc-800 rounded p-3 overflow-auto max-h-40 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <button onClick={this.handleReload} className="flex-1 px-4 py-2 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800">
                Reload page
              </button>
              <button onClick={this.handleHome} className="flex-1 px-4 py-2 rounded-md border border-zinc-300 text-zinc-700 text-sm font-medium hover:bg-zinc-50">
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
