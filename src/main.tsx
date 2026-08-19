import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthBootstrap } from "./features/auth/AuthBootstrap";
import { App } from "./app/App";
import { SetupRequired } from "./components/SetupRequired";
import "./index.css";
import { queryClient } from "./lib/queryClient";
import { isSupabaseConfigured } from "./lib/supabase";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isSupabaseConfigured ? <QueryClientProvider client={queryClient}><BrowserRouter><AuthBootstrap><App /></AuthBootstrap></BrowserRouter></QueryClientProvider> : <SetupRequired />}
  </StrictMode>,
);
