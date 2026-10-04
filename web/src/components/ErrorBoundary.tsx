import { Component, type ErrorInfo, type ReactNode } from "react";
import { UI } from "@/lib/copy";

interface Props {
  /** What failed, in words ("This view", "The document pages"). */
  label?: string;
  /** When this value changes (e.g. the active tab), a failed boundary resets and renders its children again. */
  resetKey?: unknown;
  children: ReactNode;
}
interface State { error: Error | null }

/**
 * Error boundary (web-correctness-3). A render exception or a lazy chunk that fails to load (offline, after a redeploy) used to unmount
 * the whole tree to a blank page. The root boundary keeps a labelled recovery message on screen; the per-view and per-lazy-surface
 * boundaries keep the shell, the navigation and the other views usable when one surface fails.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // ids-only logging rule: the message and the component stack, never record contents
    console.error("OralCompass surface failed:", error.message, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    return (
      <div className="error surface-error" role="alert">
        <p>{UI.surfaceFailed(this.props.label ?? UI.surfaceDefault)} {chunk ? UI.surfaceChunk : ""}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>{UI.retry}</button>
        <button type="button" className="secondary" onClick={() => window.location.reload()}>{UI.reloadPage}</button>
      </div>
    );
  }
}

/** A dynamic import that could not be fetched (Vite, Chromium, Firefox and Safari word it differently). */
export const isChunkLoadError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically|Loading chunk/i.test(e.message);

export default ErrorBoundary;
