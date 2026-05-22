import { createRoot } from "react-dom/client";
import "./lib/api";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setUnauthorizedHandler } from "@workspace/api-client-react";

// Register a global auth getter and 401 handler early so API calls that
// fire during the initial render (hard reloads) get the Authorization
// header. This avoids race conditions where `AuthProvider`'s effect
// runs after pages issue requests and causes "Missing token" 401s.
setAuthTokenGetter(() => (typeof window !== "undefined" ? localStorage.getItem("erp_token") : null));
setUnauthorizedHandler(() => {
	try {
		if (typeof window !== "undefined") {
			localStorage.removeItem("erp_token");
			const base = (import.meta.env.BASE_URL || "").replace(/\/$/, "");
			window.location.href = `${base}/login`;
		}
	} catch {
		// ignore
	}
});

createRoot(document.getElementById("root")!).render(<App />);
