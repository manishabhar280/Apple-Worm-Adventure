import React from "react";

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="state-card" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-card state-card--error" role="alert">
      <span className="state-icon" aria-hidden="true">!</span>
      <strong>We couldn’t load this right now</strong>
      <span>{message}</span>
      {onRetry && (
        <button className="small-primary" type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon = "🍎", title, description, action }) {
  return (
    <div className="state-card state-card--empty">
      <span className="empty-illustration" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}

export function DataState({ query, children, empty }) {
  if (query.status === "loading") {
    return <LoadingState />;
  }
  if (query.status === "error") {
    return <ErrorState message={query.error} onRetry={query.reload} />;
  }
  if (empty && Array.isArray(query.data) && query.data.length === 0) {
    return empty;
  }
  return children(query.data);
}
