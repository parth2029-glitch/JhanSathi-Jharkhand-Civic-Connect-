import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, setToken } from './api.js';
import { Button, Card, ago } from './ui.jsx';
import Login from './pages/Login.jsx';
import NewReport from './pages/NewReport.jsx';
import MyReports from './pages/MyReports.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Worker from './pages/Worker.jsx';
import PublicStats from './pages/PublicStats.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const HOME = { citizen: '/my', official: '/dashboard', worker: '/work' };

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) return setReady(true);
    api.get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const signIn = ({ token, user: u }) => { setToken(token); setUser(u); };
  const signOut = () => { setToken(null); setUser(null); };

  if (!ready) return <div className="p-10 text-center text-slate-500">Loading…</div>;

  return (
    <AuthContext.Provider value={{ user, signIn, signOut }}>
      <Nav />
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<Navigate to={user ? HOME[user.role] : '/public'} replace />} />
          <Route path="/public" element={<PublicStats />} />
          <Route path="/login" element={user ? <Navigate to={HOME[user.role]} replace /> : <Login />} />
          <Route path="/report" element={<Guard role="citizen"><NewReport /></Guard>} />
          <Route path="/my" element={<Guard role="citizen"><MyReports /></Guard>} />
          <Route path="/dashboard" element={<Guard role="official"><Dashboard /></Guard>} />
          <Route path="/work" element={<Guard role="worker"><Worker /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </AuthContext.Provider>
  );
}

function Guard({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />;
  return children;
}

const LINKS = {
  citizen: [['/my', 'My reports'], ['/report', 'Report an issue'], ['/public', 'Transparency']],
  official: [['/dashboard', 'Dashboard'], ['/public', 'Transparency']],
  worker: [['/work', 'My work'], ['/public', 'Transparency']],
};

function Nav() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 p-4">
        <Link to="/" className="mr-auto flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-lg text-white">◎</span>
          <span>
            <span className="block leading-tight font-bold">Jharkhand Civic Connect</span>
            <span className="block text-xs text-slate-500">Report · Prioritise · Resolve · Verify</span>
          </span>
        </Link>

        {(LINKS[user?.role] || [['/public', 'Transparency']]).map(([to, text]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100'}`
            }
          >
            {text}
          </NavLink>
        ))}

        {user ? (
          <>
            <Bell />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-xs text-slate-500 capitalize">{user.role}{user.department && ` · ${user.department}`}</div>
            </div>
            <Button variant="ghost" onClick={() => { signOut(); navigate('/public'); }}>Sign out</Button>
          </>
        ) : (
          <Button onClick={() => navigate('/login')}>Sign in</Button>
        )}
      </div>
    </header>
  );
}

function Bell() {
  const [data, setData] = useState({ unread: 0, notifications: [] });
  const [open, setOpen] = useState(false);

  const load = () => api.get('/notifications').then(({ data }) => setData(data)).catch(() => {});
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);   // in-app only for the MVP; push is a later add
    return () => clearInterval(id);
  }, []);

  const markRead = async () => {
    await api.patch('/notifications/read');
    load();
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg px-3 py-2 hover:bg-slate-100" aria-label="Notifications">
        🔔
        {data.unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
            {data.unread}
          </span>
        )}
      </button>
      {open && (
        <Card className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-auto p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-sm font-semibold">Notifications</span>
            {data.unread > 0 && <button onClick={markRead} className="text-xs text-emerald-700 hover:underline">Mark all read</button>}
          </div>
          {data.notifications.length === 0 && <p className="p-3 text-sm text-slate-500">Nothing yet.</p>}
          {data.notifications.map((n) => (
            <div key={n._id} className={`rounded-lg p-2 text-sm ${n.read ? '' : 'bg-emerald-50'}`}>
              <div className="font-medium">{n.title}</div>
              <div className="text-slate-600">{n.message}</div>
              <div className="text-xs text-slate-400">{ago(n.createdAt)}</div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
