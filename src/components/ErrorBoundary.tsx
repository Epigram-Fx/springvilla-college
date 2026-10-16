import { Component, type ErrorInfo, type ReactNode } from "react";

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("An unhandled application rendering error occurred.", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          aria-labelledby="application-error-heading"
          className="mx-auto grid min-h-screen max-w-xl place-content-center px-6 text-center"
        >
          <p className="text-sm font-bold uppercase tracking-wider text-primary-700">
            SpringVilla Admissions
          </p>
          <h1
            className="mt-3 text-2xl font-bold text-slate-900"
            id="application-error-heading"
          >
            We couldn’t load this page
          </h1>
          <p className="mt-3 text-slate-600">
            Please try again. If the problem continues, contact the school.
          </p>
          <button
            className="mt-6 justify-self-center rounded-md bg-primary-700 px-5 py-3 font-semibold text-white hover:bg-primary-800"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
