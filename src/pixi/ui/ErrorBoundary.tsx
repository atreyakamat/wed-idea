"use client";
import { Component, type ReactNode } from "react";

/** Keeps one broken screen from taking the whole app down. The camera and the roll stay reachable. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset?: () => void }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { if (process.env.NODE_ENV !== "production") console.error(err); }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
        <h2 className="text-[1.25rem] font-semibold">That screen ran into a problem</h2>
        <p className="text-[0.9375rem] leading-relaxed text-white/45">Your photos and looks are safe. Go back and try again.</p>
        <button onClick={() => { this.setState({ err: null }); this.props.onReset?.(); }} className="rounded-full bg-white px-6 py-3 text-[0.9375rem] font-semibold text-black">Go back</button>
      </div>
    );
  }
}
