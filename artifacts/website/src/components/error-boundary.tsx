import { Component, type ErrorInfo, type ReactNode } from "react";

// Top-level safety net so a render error doesn't blank out the storefront
// and lose a checkout. Customer gets a friendly retry instead of a white page.
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
        <div className="min-h-screen flex items-center justify-center bg-white p-6">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg border border-zinc-200 p-6 space-y-4">
            <h1 className="text-xl font-bold text-zinc-900">Sorry, something went wrong</h1>
            <p className="text-sm text-zinc-600">The page hit an unexpected error. Please try again — your cart is safe.</p>
            <pre className="text-xs bg-zinc-50 text-zinc-700 rounded p-3 overflow-auto max-h-32 whitespace-pre-wrap border border-zinc-200">
              {this.state.error.message}
            </pre>
            <div className="flex gap-2">
              <button onClick={this.handleReload} className="flex-1 px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600">
                Try again
              </button>
              <button onClick={this.handleHome} className="flex-1 px-4 py-2 rounded-md border border-zinc-300 text-zinc-700 text-sm font-semibold hover:bg-zinc-50">
                Back to home
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
