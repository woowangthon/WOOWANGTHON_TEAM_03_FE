import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Component } from "react";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import "./styles.css";

class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="boot-screen">
          <h1>화면을 표시하지 못했습니다</h1>
          <p>
            새로고침해 다시 확인해 주세요. 변경 요청을 자동으로 반복하지
            않습니다.
          </p>
          <button onClick={() => location.reload()}>새로고침</button>
        </main>
      );
    return this.props.children;
  }
}
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>,
);
