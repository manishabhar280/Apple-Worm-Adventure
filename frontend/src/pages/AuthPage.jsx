import React, { useState } from "react";
import { api } from "../services/api.js";

function AuthPage({ mode, navigate, onAuthenticated }) {
  const isRegister = mode === "register";
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const result = isRegister
        ? await api.register(values)
        : await api.login(values);
      onAuthenticated(result.user, result.token);
      navigate("/dashboard");
    } catch (requestError) {
      setError(requestError.message || "Please try again.");
      setStatus("error");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <button className="auth-back" type="button" onClick={() => navigate("/")}>
          <span aria-hidden="true">←</span> Back home
        </button>
        <div className="auth-mark" aria-hidden="true">{isRegister ? "🌱" : "🍏"}</div>
        <p className="eyebrow">{isRegister ? "Join the orchard" : "Welcome back"}</p>
        <h1>{isRegister ? "Start your adventure" : "Log in to play"}</h1>
        <p className="auth-description">
          {isRegister
            ? "Save your spot and make this little world yours."
            : "Your next apple-collecting adventure is waiting."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label>
              Player name
              <input
                autoComplete="name"
                required
                value={values.name}
                onChange={(event) => setValues({ ...values, name: event.target.value })}
                placeholder="How should we call you?"
              />
            </label>
          )}
          <label>
            Email address
            <input
              autoComplete="email"
              type="email"
              required
              value={values.email}
              onChange={(event) => setValues({ ...values, email: event.target.value })}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              autoComplete={isRegister ? "new-password" : "current-password"}
              type="password"
              minLength="8"
              maxLength="72"
              required
              value={values.password}
              onChange={(event) => setValues({ ...values, password: event.target.value })}
              placeholder="At least 8 characters"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="large-primary auth-submit" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "One moment..." : isRegister ? "Create account" : "Log in"}
            {status !== "loading" && <span aria-hidden="true">→</span>}
          </button>
          <p className="demo-notice">Your password is securely hashed by the server and is never stored in plain text.</p>
        </form>

        <p className="auth-switch">
          {isRegister ? "Already have an account?" : "New to the orchard?"}{" "}
          <button type="button" onClick={() => navigate(isRegister ? "/login" : "/register")}>
            {isRegister ? "Log in" : "Create an account"}
          </button>
        </p>
      </section>
      <aside className="auth-art">
        <span className="auth-art-orbit">✿</span>
        <div className="auth-art-emoji">🐛</div>
        <h2>Small steps.<br />Sweet victories.</h2>
        <p>A cozy puzzle garden made for curious minds.</p>
      </aside>
    </main>
  );
}

export default AuthPage;
