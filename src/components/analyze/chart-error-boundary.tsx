"use client";

import React from "react";

interface State {
  hasError: boolean;
}

/** Swallows lightweight-charts "Object is disposed" errors and similar.
 *  These are non-fatal — they happen when async observers fire after
 *  the chart is removed. We re-render to recover. */
export class ChartErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    // Suppress lightweight-charts disposed-object errors
    if (error.message.includes("disposed") || error.message.includes("Disposed")) {
      return { hasError: true };
    }
    // Other errors propagate
    throw error;
  }

  componentDidCatch(error: Error) {
    if (error.message.toLowerCase().includes("disposed")) {
      // Recover by re-rendering after a tick — the chart will be re-created cleanly
      setTimeout(() => this.setState({ hasError: false }), 0);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
