import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// @ts-ignore - declarations globais para módulos CSS ainda não estão configuradas
import './styles.css';


ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);