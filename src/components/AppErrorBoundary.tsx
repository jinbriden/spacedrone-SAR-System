import { Alert, Button } from "antd";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error?: Error;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("SPACEDRONE application error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error-page">
        <Alert
          type="error"
          showIcon
          title="仿真界面发生未恢复错误"
          description={`${this.state.error.message}。请检查输入参数；若与 WebGL 有关，请启用硬件加速并更新显卡驱动。`}
        />
        <Button type="primary" onClick={() => window.location.reload()}>重新加载应用</Button>
      </main>
    );
  }
}
