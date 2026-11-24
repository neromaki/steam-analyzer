import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Search from './pages/Search';
import NotFound from './pages/NotFound';

// These pages carry the chart library, so they load on first use.
const Home = lazy(() => import('./pages/Home'));
const GamePage = lazy(() => import('./pages/Game'));
const loading = <div className="page muted">Loading…</div>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Suspense fallback={loading}><Home /></Suspense>} />
        <Route path="search" element={<Search />} />
        <Route path="game/:appid" element={<Suspense fallback={loading}><GamePage /></Suspense>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
