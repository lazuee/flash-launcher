import "./styles/global.css";

import { createRoot } from "react-dom/client";
import App from "./App";

const containerId = "root";
let container = document.getElementById(containerId);
if (!container) {
  container = document.createElement("div");
  container.id = containerId;
  document.body.appendChild(container);
}

const root = createRoot(container);
root.render(<App />);