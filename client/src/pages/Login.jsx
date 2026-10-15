import { useState } from 'react';
import { api, WARDS } from '../api.js';
import { useAuth } from '../App.jsx';
import { Alert, Button, Card, Field, input } from '../ui.jsx';

const DEMO = [
  ['Citizen', 'citizen@demo.com'],
  ['Official', 'official@demo.gov'],
  ['Field worker', 'worker@demo.gov'],
];

export default function Login() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '', ward: WARDS[0] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/auth/${mode === 'login' ? 'login' : 'register'}`, form);
      signIn(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card className="p-6">
        <h1 className="text-xl font-bold">{mode === 'login' ? 'Sign in' : 'Create a citizen account'}</h1>
        <p className="mt-1 mb-4 text-sm text-slate-500">
          {mode === 'login' ? 'Citizens, officials and field workers use the same sign-in.' : 'Officials and field workers are onboarded by the department.'}
        </p>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <>
              <Field label="Full name">
                <input className={input} value={form.name} onChange={set('name')} required />
              </Field>
              <Field label="Phone">
                <input className={input} value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label="Ward">
                <select className={input} value={form.ward} onChange={set('ward')}>
                  {WARDS.map((w) => <option key={w}>{w}</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Email">
            <input className={input} type="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Password" hint={mode === 'register' ? 'At least 6 characters.' : undefined}>
            <input className={input} type="password" value={form.password} onChange={set('password')} required />
          </Field>
          <Alert>{error}</Alert>
          <Button className="w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
          className="mt-4 w-full text-sm text-emerald-700 hover:underline"
        >
          {mode === 'login' ? 'New here? Create a citizen account' : 'Already registered? Sign in'}
        </button>
      </Card>

      <Card className="p-4">
        <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Demo accounts (password123)</div>
        <div className="flex flex-wrap gap-2">
          {DEMO.map(([role, email]) => (
            <Button
              key={email}
              variant="ghost"
              onClick={() => { setMode('login'); setForm({ ...form, email, password: 'password123' }); }}
            >
              {role}
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
