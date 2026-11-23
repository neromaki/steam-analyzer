import { Link, Outlet } from 'react-router-dom';
import { configured } from '../lib/api';
import { useMeta } from '../lib/data';
import { fmtDate, fmtInt } from '../lib/format';
import { useTheme } from '../lib/theme';
import { useLink } from '../lib/url';
import FloorControl from './FloorControl';
import SearchBar from './SearchBar';

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 24 L12 15 L17 19 L28 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28" cy="7" r="2.8" fill="currentColor" />
    </svg>
  );
}

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button className="btn ghost" onClick={toggle} title={dark ? 'Switch to light theme' : 'Switch to dark theme'} aria-label="Toggle theme">
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

function DataStamp() {
  const meta = useMeta();
  if (!meta.data) return null;
  return (
    <span className="header-meta" title={`Built ${new Date(meta.data.built_at).toLocaleString('en-GB')}`}>
      {fmtInt(meta.data.n_games)} games · data to {fmtDate(meta.data.fetched_to)}
    </span>
  );
}

export default function Layout() {
  const link = useLink();
  return (
    <div className="app">
      <header className="header">
        <Link to={link('/')} className="brand">
          <Logo /> Steam Trends
        </Link>
        <SearchBar />
        <div className="spacer" />
        <DataStamp />
        <FloorControl />
        <ThemeToggle />
      </header>
      <main className="main" id="main">
        {!configured && (
          <div className="page">
            <div className="banner error">
              The site isn't connected to its database: set <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> (see web/README.md).
            </div>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
