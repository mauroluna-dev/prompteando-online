import { AppShell } from "./components/AppShell";
import "./index.css";

// Pγ: AppShell owns the layout (sticky header + Outlet).
export function App() {
  return <AppShell />;
}

export default App;
