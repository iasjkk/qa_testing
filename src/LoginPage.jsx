import { useState } from "react";
import { dbLogin, dbSignup } from "./db";
import { saveSessionFromDB } from "./auth";
import "./LoginPage.css";

export default function LoginPage({ onLogin }) {
  const [tab,      setTab]      = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");
  const [loading,  setLoading]  = useState(false);

  const reset = () => { setError(""); setSuccess(""); };
  const switchTab = (t) => { setTab(t); setError(""); setSuccess(""); setUsername(""); setPassword(""); setConfirm(""); };

  const handleLogin = async (e) => {
    e.preventDefault();
    reset();
    if (!username.trim() || !password) { setError("Enter username and password."); return; }
    setLoading(true);
    try {
      const result = await dbLogin(username, password);
      if (result.error) { setError(result.error); return; }
      const session = saveSessionFromDB(result.user);
      onLogin(session);
    } catch (err) {
      setError("Connection error. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    reset();
    if (!username.trim() || !password) { setError("All fields are required."); return; }
    if (username.trim().length < 3)    { setError("Username must be at least 3 characters."); return; }
    if (password.length < 6)           { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm)          { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const result = await dbSignup(username, password);
      if (result.error) { setError(result.error); return; }
      setSuccess("Account created! You can now log in.");
      switchTab("login");
    } catch (err) {
      setError("Connection error. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">QA</div>
          <div>
            <h1>Automation Testing</h1>
            <p>Evaluation &amp; Scoring Platform</p>
          </div>
        </div>

        <div className="login-tabs">
          <button className={`login-tab ${tab === "login"  ? "active" : ""}`} onClick={() => switchTab("login")}>Log In</button>
          <button className={`login-tab ${tab === "signup" ? "active" : ""}`} onClick={() => switchTab("signup")}>Sign Up</button>
        </div>

        {error   && <div className="login-alert error">{error}</div>}
        {success && <div className="login-alert success">{success}</div>}

        {tab === "login" && (
          <form className="login-form" onSubmit={handleLogin} autoComplete="off">
            <label className="login-label">Username</label>
            <input className="login-input" type="text" placeholder="Enter your username"
              value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            <label className="login-label">Password</label>
            <input className="login-input" type="password" placeholder="Enter your password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Log In"}
            </button>
          </form>
        )}

        {tab === "signup" && (
          <form className="login-form" onSubmit={handleSignup} autoComplete="off">
            <label className="login-label">Username</label>
            <input className="login-input" type="text" placeholder="Choose a username (min 3 chars)"
              value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            <label className="login-label">Password</label>
            <input className="login-input" type="password" placeholder="Choose a password (min 6 chars)"
              value={password} onChange={(e) => setPassword(e.target.value)} />
            <label className="login-label">Confirm Password</label>
            <input className="login-input" type="password" placeholder="Re-enter your password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>
        )}

        <p className="login-footer">
          {tab === "login"
            ? <>No account? <button className="login-link" onClick={() => switchTab("signup")}>Sign Up</button></>
            : <>Already have an account? <button className="login-link" onClick={() => switchTab("login")}>Log In</button></>
          }
        </p>
        {tab === "login" && (
          <p className="login-footer" style={{ marginTop: 8, fontSize: 12, color: "#aaa" }}>
            Forgot your password? Contact your admin to reset it.
          </p>
        )}
      </div>
    </div>
  );
}
