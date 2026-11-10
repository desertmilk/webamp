import React from "react";
import { createRoot } from "react-dom/client";
import SkinEditor from "./SkinEditor";
import "../css/skin-editor.css";

const root = document.getElementById("skin-editor-root");
if (!root) throw new Error("Skin editor root element is missing");

createRoot(root).render(
  <React.StrictMode>
    <SkinEditor />
  </React.StrictMode>
);
