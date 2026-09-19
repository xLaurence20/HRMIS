import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // In production, ship this to your logging endpoint.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
    window.location.href = '/';
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </span>
            <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          </div>

          <p className="mt-4 text-sm text-slate-600">
            The page crashed unexpectedly. Your data has not been lost.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
            {String(error?.message ?? error)}
          </pre>

          {import.meta.env.DEV && info?.componentStack && (
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
              {info.componentStack}
            </pre>
          )}

          <button
            type="button"
            onClick={this.handleReset}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            <RotateCcw className="h-4 w-4" />
            Return to safety
          </button>
        </div>
      </div>
    );
  }
}