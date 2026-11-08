import React from "react";
import { AchievementSummary } from "./GuestPages.jsx";
import { FEATURE_REWARDS } from "../../../shared/levelFeatures.js";

function LandingPage({ navigate, playNow, achievements, engagement }) {
  return (
    <main className="landing-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-badge"><i /> 100 puzzles · one continuous adventure</span>
          <h1>One little worm.<br /><span>A whole orchard</span><br />to explore.</h1>
          <p>
            Follow one unbroken trail from your first apple to the final portal.
            Think ahead, find clever routes, and let every level lead to the next.
          </p>
          <div className="hero-actions">
            <button className="large-primary" type="button" onClick={playNow}>
              PLAY NOW <span aria-hidden="true">→</span>
            </button>
            <button className="large-secondary" type="button" onClick={() => navigate("/levels")}>
              Explore all levels
            </button>
          </div>
          <div className="hero-proof">
            <span className="proof-avatars" aria-hidden="true">🐛 🍎 🌱</span>
            <span>One orchard. A hundred clever puzzles.</span>
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

      {achievements && (
        <AchievementSummary achievements={achievements} navigate={navigate} />
      )}

      <section className="engagement-shortcuts" aria-label="Daily play and cosmetics">
        <button type="button" className="engagement-shortcut" onClick={() => navigate("/daily")}>
          <span aria-hidden="true">📅</span>
          <span>
            <strong>Daily Challenge</strong>
            <small>A featured puzzle and {FEATURE_REWARDS.dailyChallenge} local guest coins</small>
          </span>
          <b aria-hidden="true">→</b>
        </button>
        <button type="button" className="engagement-shortcut" onClick={() => navigate("/collection")}>
          <span aria-hidden="true">🐛</span>
          <span>
            <strong>Worm Collection</strong>
            <small>{engagement?.coins ?? 0} guest coins · cosmetic skins</small>
          </span>
          <b aria-hidden="true">→</b>
        </button>
      </section>

      <section className="landing-features" aria-label="Game features">
        <article><span>🧩</span><strong>Think it through</strong><p>Every turn is a tiny puzzle. Plan a path, then watch it unfold.</p></article>
        <article><span>🍎</span><strong>Gather the good stuff</strong><p>Collect apples, grow your worm, and discover new routes.</p></article>
        <article><span>🌿</span><strong>Take it at your pace</strong><p>One hundred handcrafted-feeling trails, from first steps to tricky turns.</p></article>
      </section>
    </main>
  );
}

export default LandingPage;
