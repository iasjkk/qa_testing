import { useState } from "react";
import { dbLogin } from "./db";
import { saveSessionFromDB } from "./auth";
import logo from "./assets/login_logo.png";
import "./LoginPage.css";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) { setError("Enter username and password."); return; }
    setLoading(true);
    try {
      const result = await dbLogin(username, password);
      if (result.error) { setError(result.error); return; }
      onLogin(saveSessionFromDB(result.user));
    } catch {
      setError("Connection error. Check your internet and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src={logo} alt="logo" className="login-brand-logo" />
          {/* <div className="login-brand-icon">QA</div> */}
            {/* <div className="logo">
              <h1>Gulsha</h1>
              <p>Impressions by Swati</p>
            </div> */}

        </div>
        {error && <div className="login-alert error">{error}</div>}
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
        <p className="login-footer" style={{ marginTop: 8, fontSize: 12, color: "#aaa" }}>
          Forgot your password? Contact your admin to reset it.
        </p>
      </div>
    </div>
  );
}
