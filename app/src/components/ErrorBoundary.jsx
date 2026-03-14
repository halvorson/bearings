import { Component } from 'react';
import { copyErrorToClipboard } from '../lib/errors';

const IS_DEV = import.meta.env.DEV;

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info);
    this.setState({ componentStack: info?.componentStack ?? null });
  }

  handleCopy = async () => {
    const { error, componentStack } = this.state;
    const augmented = error ? Object.assign(Object.create(error), error, { componentStack }) : error;
    await copyErrorToClipboard(augmented);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (!IS_DEV) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-4">
          <div className="max-w-sm w-full text-center">
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong.</h1>
            <p className="text-gray-500 mb-6">Please refresh the page.</p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium min-h-[44px] min-w-[44px]"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    const { error, componentStack, copied } = this.state;

    return (
      <div className="flex flex-col h-full bg-gray-50 p-4 overflow-auto">
        <div className="max-w-2xl w-full mx-auto">
          <h1 className="text-xl font-bold text-red-700 mb-1">Unhandled Error</h1>
          <p className="text-gray-500 text-sm mb-4">Dev mode — full details shown below.</p>

          {error?.message && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Message</h2>
              <pre className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800 whitespace-pre-wrap break-words">
                {error.message}
              </pre>
            </div>
          )}

          {error?.code && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Code</h2>
              <pre className="bg-gray-100 border border-gray-200 rounded p-3 text-sm text-gray-800 whitespace-pre-wrap break-words">
                {error.code}
              </pre>
            </div>
          )}

          {error?.stack && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Stack Trace</h2>
              <pre className="bg-gray-100 border border-gray-200 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap break-words overflow-auto max-h-48">
                {error.stack}
              </pre>
            </div>
          )}

          {componentStack && (
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Component Stack</h2>
              <pre className="bg-gray-100 border border-gray-200 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap break-words overflow-auto max-h-48">
                {componentStack}
              </pre>
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              onClick={this.handleCopy}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium min-h-[44px] min-w-[44px]"
            >
              {copied ? 'Copied!' : 'Copy Error Details'}
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium min-h-[44px] min-w-[44px]"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
