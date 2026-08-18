import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/layout/Shell";
import { DashboardPage } from "./pages/DashboardPage";
import { SamplesListPage } from "./pages/SamplesListPage";
import { SampleDetailPage } from "./pages/SampleDetailPage";
import { LiteraturePage } from "./pages/LiteraturePage";
import { LoginPage } from "./pages/LoginPage";
import { ProjectSelectionPage } from "./pages/ProjectSelectionPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/projetos" element={<ProjectSelectionPage />} />
        <Route element={<Shell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/amostras" element={<SamplesListPage />} />
          <Route path="/amostras/:id" element={<SampleDetailPage />} />
          <Route path="/literatura" element={<LiteraturePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
