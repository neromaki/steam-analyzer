import { Link } from 'react-router-dom';
import { useLink } from '../lib/url';

export default function NotFound() {
  const link = useLink();
  return (
    <div className="page">
      <div className="empty">
        <h1>Page not found</h1>
        <p>
          <Link to={link('/')}>Back to the overview</Link>
        </p>
      </div>
    </div>
  );
}
