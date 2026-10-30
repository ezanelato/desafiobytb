import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles.css";

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Erro inesperado.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Falha ao renderizar o Nexo Assist:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="startup-error">
          <div className="startup-error-card">
            <span className="brand-mark">N</span>
            <h1>Não foi possível abrir o Nexo Assist</h1>
            <p>O app encontrou um erro ao iniciar. Recarregue a página.</p>
            <code>{this.state.error}</code>
            <button onClick={() => window.location.reload()}>Recarregar</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById("root")!);

/* ------ Carrega o app em modo de desenvolvimento e mostra erros de inicialização ------ */
import("./App")
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <BrowserRouter>
          <AppErrorBoundary>
            <App />
          </AppErrorBoundary>
        </BrowserRouter>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("Falha ao carregar o Nexo Assist:", error);
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    root.render(
      <main className="startup-error">
        <div className="startup-error-card">
          <span className="brand-mark">N</span>
          <h1>Não foi possível carregar o Nexo Assist</h1>
          <p>Confira o erro de inicialização e tente recarregar a página.</p>
          <code>{message}</code>
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      </main>,
    );
  });
