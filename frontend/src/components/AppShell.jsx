import React from "react";

const navigation = [
  { path: "/", label: "Home", icon: "⌂" },
  { path: "/levels", label: "Levels", icon: "▦" },
  { path: "/daily", label: "Daily Challenge", icon: "◷" },
  { path: "/collection", label: "Worm Collection", icon: "🐛" },
  { path: "/statistics", label: "Statistics", icon: "▤" },
  { path: "/achievements", label: "Achievements", icon: "✧" },
  { path: "/settings", label: "Settings", icon: "⚙" },
];

function AppShell({ path, navigate, reducedMotion, darkMode, children }) {
  const isGame = path === "/game";
  const isLanding = path === "/";
  const shellClasses = [
    "app-shell",
    isGame && "app-shell--game",
    reducedMotion && "app-shell--reduced-motion",
    darkMode && "app-shell--dark-mode",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClasses}>
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
            {navigation.map((item) => (
              <button
                type="button"
                key={item.path}
                className={`nav-link ${path === item.path ? "nav-link--active" : ""}`}
                onClick={() => navigate(item.path)}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        )}
      </header>
      {children}
    </div>
  );
}

export default AppShell;
