import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './login.css';

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState([]);   // demo accounts, only listed when the server has quick access switched on

  useEffect(() => {
    fetch('/auth/demo-users').then((r) => (r.ok ? r.json() : { users: [] })).then((j) => setDemo(j.users || [])).catch(() => {});
  }, []);

  const signIn = async (request) => {
    setErr(''); setBusy(true);
    try {
      const r = await request();
      if (r.ok) { location.href = '/app.html'; return; }
      const j = await r.json().catch(() => ({}));
      setErr(j.error || 'Sign-in failed.');
    } catch { setErr('Could not reach the server.'); }
    setBusy(false);
  };
  const submit = (e) => { e.preventDefault(); signIn(() => post('/auth/login', { email, password })); };

  return (
    <form className="card" onSubmit={submit}>
      <div className="brand"><img src="images/brick-four-logo.jpeg" alt="Brick Four" />Compliance Tracker</div>
      <div className="subtitle">Sign in to access real estate compliance &amp; regulatory intelligence</div>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="pw">Password</label>
      <input id="pw" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="err" role="alert" style={err ? { display: 'block' } : undefined}>{err}</div>
      <button type="submit" disabled={busy}>Sign in</button>

      {demo.length > 0 && (
        <section className="quick" aria-labelledby="quick-title">
          <div className="quick-head">
            <span id="quick-title">Quick access</span>
            <span className="quick-note">Demo accounts · one click</span>
          </div>
          <div className="quick-grid">
            {demo.map((u) => (
              <button key={u.email} type="button" className="quick-btn" disabled={busy} title={u.email}
                onClick={() => signIn(() => post('/auth/demo-login', { email: u.email }))}>
                <span className="quick-avatar" aria-hidden="true">{(u.name || '?').trim().charAt(0).toUpperCase()}</span>
                <span className="quick-text">
                  <span className="quick-role">{u.role_label}</span>
                  <span className="quick-name">{u.name}{u.limited ? ' · 1 project' : ''}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </form>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><Login /></StrictMode>);
