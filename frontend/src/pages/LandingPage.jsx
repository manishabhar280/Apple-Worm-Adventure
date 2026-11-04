import React from "react";

function LandingPage({ navigate, playFirstLevel }) {
  return (
    <main className="landing-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-badge"><i /> A little puzzle, a lot of heart</span>
          <h1>One little worm.<br /><span>A whole orchard</span><br />to explore.</h1>
          <p>
            Wiggle through cozy brain-teasers, collect every apple, and find
            your way to the portal. Your next favorite little adventure starts here.
          </p>
          <div className="hero-actions">
            <button className="large-primary" type="button" onClick={playFirstLevel}>
              Play the first level <span aria-hidden="true">→</span>
            </button>
            <button className="large-secondary" type="button" onClick={() => navigate("/register")}>
              Create a free account
            </button>
          </div>
          <div className="hero-proof">
            <span className="proof-avatars" aria-hidden="true">🐛 🍎 🌱</span>
            <span>A tiny world full of clever puzzles</span>
          </div>
        </div>
        <div className="hero-art" aria-label="A happy worm exploring an apple orchard">
          <div className="sun-disc" />
          <span className="floating-leaf floating-leaf--one">✦</span>
          <span className="floating-leaf floating-leaf--two">✿</span>
          <div className="hero-hill hero-hill--back" />
          <div className="hero-hill hero-hill--front" />
          <div className="hero-orchard-tree tree-one"><span>🍎</span></div>
          <div className="hero-orchard-tree tree-two"><span>🍏</span></div>
          <div className="hero-orchard-tree tree-three"><span>🍎</span></div>
          <div className="hero-worm">🐛</div>
          <div className="hero-path" />
          <div className="hero-art-caption"><span>LEVEL 01</span><strong>First Harvest</strong></div>
        </div>
      </section>

      <section className="landing-features" aria-label="Game features">
        <article><span>🧩</span><strong>Think it through</strong><p>Every turn is a tiny puzzle. Plan a path, then watch it unfold.</p></article>
        <article><span>🍎</span><strong>Gather the good stuff</strong><p>Collect apples, grow your worm, and discover new routes.</p></article>
        <article><span>🌿</span><strong>Take it at your pace</strong><p>Fifty handcrafted-feeling trails, from first steps to tricky turns.</p></article>
      </section>
    </main>
  );
}

export default LandingPage;
