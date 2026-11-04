import React from "react";

const navigation = [
  { path: "/dashboard", label: "Home", icon: "⌂" },
  { path: "/levels", label: "Levels", icon: "▦" },
  { path: "/history", label: "History", icon: "◷" },
  { path: "/leaderboard", label: "Leaderboard", icon: "♜" },
  { path: "/achievements", label: "Achievements", icon: "✧" },
  { path: "/wallet", label: "Wallet", icon: "◉" },
  { path: "/profile", label: "Profile", icon: "☺" },
];

function AppShell({ path, navigate, player, onLogout, children }) {
  const isGame = path === "/game";
  const isLanding = path === "/";

  return (
    <div className={`app-shell ${isGame ? "app-shell--game" : ""}`}>
      <header className="app-topbar">
        <button
          className="app-brand"
          type="button"
          onClick={() => navigate("/")}
          aria-label="Apple Worm Adventure home"
        >
          <span className="brand-icon" aria-hidden="true">🍏</span>
          <span className="brand-copy">
            <strong>Apple Worm</strong>
            <small>ADVENTURE</small>
          </span>
        </button>

        {!isLanding && (
          <nav className="main-nav" aria-label="Main navigation">
            {[...navigation, ...(player?.role === "admin" ? [{ path: "/admin", label: "Admin", icon: "⚙" }] : [])].map((item) => (
              <button
                type="button"
                key={item.path}
                className={`nav-link ${path === item.path || (path === "/profile" && item.path === "/dashboard") ? "nav-link--active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {player ? (
          <div className="signed-in-actions">
            <button
              className="profile-shortcut"
              type="button"
              onClick={() => navigate("/profile")}
              aria-label={`Open ${player.name}'s profile`}
            >
              <span className="profile-avatar">{player.avatar || "🐛"}</span>
              <span>{player.name.split(" ")[0]}</span>
            </button>
            <button className="text-button logout-button" type="button" onClick={onLogout}>
              Log out
            </button>
          </div>
        ) : (
          <div className="topbar-actions">
            <button type="button" className="text-button" onClick={() => navigate("/login")}>
              Log in
            </button>
            <button type="button" className="small-primary" onClick={() => navigate("/register")}>
              Sign up
            </button>
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

export default AppShell;
