import React, { useRef, useState } from "react";
import { BOOSTER_CATALOG } from "../../../shared/boosterCatalog.js";

function BoosterPanel({
  inventory = {},
  catalog = Object.values(BOOSTER_CATALOG),
  balance,
  authenticated,
  game,
  canUse,
  onPurchase,
  onUse,
}) {
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const purchaseRequestIds = useRef(new Map());

  async function purchase(booster) {
    if (!authenticated || pendingId) return;
    if (!window.confirm(`Purchase ${booster.name} for ${booster.price} coins?`)) return;
    setPendingId(booster.id);
    setMessage("");
    setError("");
    try {
      const requestId = purchaseRequestIds.current.get(booster.id) ||
        globalThis.crypto.randomUUID();
      purchaseRequestIds.current.set(booster.id, requestId);
      await onPurchase(booster.id, requestId);
      purchaseRequestIds.current.delete(booster.id);
      setMessage(`${booster.name} added to your inventory.`);
    } catch (purchaseError) {
      setError(purchaseError.message);
    } finally {
      setPendingId("");
    }
  }

  async function use(booster) {
    if (!authenticated || !canUse(booster.id) || pendingId) return;
    setPendingId(booster.id);
    setMessage("");
    setError("");
    try {
      await onUse(booster.id);
      setMessage(`${booster.name} activated.`);
    } catch (useError) {
      setError(useError.message);
    } finally {
      setPendingId("");
    }
  }

  return (
    <section className="booster-panel" aria-labelledby="booster-panel-title">
      <div className="booster-panel-heading">
        <div>
          <p className="eyebrow">Game supplies</p>
          <h2 id="booster-panel-title">Boosters</h2>
        </div>
        <span className="booster-balance">
          {Number.isFinite(balance) ? `${balance} coins` : "Sign in to use"}
        </span>
      </div>
      {game.shieldActive && <p className="booster-active" role="status">Shield active · protects one eligible collision</p>}
      {game.shieldConsumed && <p className="booster-consumed" role="status">Shield consumed</p>}
      {game.freezeActionsRemaining > 0 && (
        <p className="booster-active" role="status">
          Moving obstacles frozen · {game.freezeActionsRemaining} accepted moves
        </p>
      )}
      {game.extraMovesAdded > 0 && (
        <p className="booster-active" role="status">
          Extra moves added · {game.extraMovesUsed || 0}/2 uses this level
        </p>
      )}
      <div className="booster-list">
        {catalog.map((booster) => (
          <article className="booster-item" key={booster.id}>
            <div className="booster-item-copy">
              <strong>{booster.name}</strong>
              <span>{booster.description}</span>
              <small>{inventory[booster.id] || 0} in inventory · {booster.price} coins</small>
            </div>
            <div className="booster-item-actions">
              <button
                type="button"
                className="booster-use-button"
                disabled={!authenticated || !inventory[booster.id] || !canUse(booster.id) || Boolean(pendingId)}
                onClick={() => void use(booster)}
              >
                {pendingId === booster.id ? "Working…" : "Use"}
              </button>
              <button
                type="button"
                className="booster-buy-button"
                disabled={!authenticated || Boolean(pendingId)}
                onClick={() => void purchase(booster)}
              >
                Buy
              </button>
            </div>
          </article>
        ))}
      </div>
      {!authenticated && <p className="control-note">Sign in to purchase and use boosters.</p>}
      {message && <p className="booster-message" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

export default BoosterPanel;
