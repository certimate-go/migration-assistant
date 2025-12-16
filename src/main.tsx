import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./main.css";
import "./style.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
