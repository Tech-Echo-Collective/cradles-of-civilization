import React from "react";
import { createRoot } from "react-dom/client";
import "./base.css";
const root = createRoot(document.getElementById("root"));
const demo = new URLSearchParams(location.search).get("demo") === "1";
try {
  if (demo) {
    const { default: DemoApp } = await import("./DemoApp.jsx");
    root.render(
      <React.StrictMode>
        <DemoApp />
      </React.StrictMode>,
    );
  } else {
    const [{ default: App }, { loadEngine }] = await Promise.all([
      import("./App.jsx"),
      import("./engine/runtime.js"),
    ]);
    const engine = await loadEngine();
    root.render(
      <React.StrictMode>
        <App engine={engine} />
      </React.StrictMode>,
    );
  }
} catch (error) {
  root.render(
    <main className="game-load-error">
      <h1>世界暂时无法打开</h1>
      <p>{error.message}</p>
      <button onClick={() => location.reload()}>重新加载</button>
    </main>,
  );
}
