import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Search from './pages/Search';
import NotFound from './pages/NotFound';

// The game page carries the chart library, so it loads on first use.
const GamePage = lazy(() => import('./pages/Game'));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<Search />} />
        <Route path="game/:appid" element={<Suspense fallback={<div className="page muted">Loading…</div>}><GamePage /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
