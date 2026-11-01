import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage';
import MapPage from './pages/MapPage';

const root = document.getElementById('root')!;

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename="/app">
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<MapPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
