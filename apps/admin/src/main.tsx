import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import "./auth";
import Admin from "./Admin";
import Editor from "./Editor";
import RequireAuth from "./RequireAuth";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Admin />} />
      <Route path="/admin" element={<Navigate to="/" replace />} />
      <Route path="/editor" element={<RequireAuth><Editor /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);
