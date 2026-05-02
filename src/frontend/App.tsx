import { Outlet } from "react-router";
import { Header } from "./components/Header";
import "./index.css";

export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}

export default App;
