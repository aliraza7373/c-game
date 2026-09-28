import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Login() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = () => {
    if (login === "admin" && password === "1234") {
      navigate("/");
    } else {
      setError("Invalid username or password (Hint: admin / 1234)");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* wave icon */}
        <div className="login-icon">
          <svg viewBox="0 0 42 42" aria-hidden="true">
            <path d="M5 24c4.8-7 9.6-7 14.4 0s9.6 7 17.6 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
            <path d="M5 16c4.8-7 9.6-7 14.4 0s9.6 7 17.6 0" fill="none" opacity=".55" stroke="currentColor" strokeLinecap="round" strokeWidth="3.5" />
          </svg>
        </div>

        <h1 className="login-title">Welcome back</h1>
        <p className="login-subtitle">Sign in to take command of the helm</p>

        <div className="login-fields">
          <div className="input-group">
            <label htmlFor="login-user">Username or email</label>
            <input
              id="login-user"
              type="text"
              placeholder="Enter your username (admin)"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="username"
            />
          </div>

          <div className="input-group">
            <label htmlFor="login-pass">Password</label>
            <input
              id="login-pass"
              type="password"
              placeholder="Enter your password (1234)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="current-password"
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button className="login-submit" type="button" onClick={handleLogin}>
            Sign in & Take Helm
          </button>

          <button className="login-guest-btn" type="button" onClick={() => navigate("/")}>
            ⚓ Play 3D Boat Game as Guest
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;

