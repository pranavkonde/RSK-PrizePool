import { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { WagmiProviders } from "./wagmi.jsx";

class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "system-ui", color: "#e5e5e5", background: "#0d0d0f", minHeight: "100vh" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ opacity: 0.85, marginBottom: 16 }}>{String(this.state.error?.message || this.state.error)}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600 }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RootErrorBoundary>
      <WagmiProviders>
        <App />
      </WagmiProviders>
    </RootErrorBoundary>
  </StrictMode>
);
