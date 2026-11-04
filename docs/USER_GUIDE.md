# Player Guide

## Create an account and sign in

Choose **Sign up**, enter a player name, email, and password, then submit. Passwords are hashed by the server. Sign in to restore your saved level progress and resume an unfinished game. The server maintains your session in an HttpOnly cookie that page scripts cannot read. Logging out invalidates the session. Sessions expire after the configured token lifetime (one hour by default), after which you need to sign in again. Browser cookie restrictions may affect sessions on the default separate Netlify and Render hostnames.

## Play

Choose **Levels** and select an unlocked puzzle, or use **Continue playing** from the dashboard. Move the worm with the arrow keys or WASD; on a phone or tablet, swipe across the board. Collect every apple and enter the portal. Walls, the edge of the board, and the worm's body can cause a failed attempt. Use **Hint**, **Pause**, or **Restart Level** as needed.

The server replays signed-in players' submitted moves against the canonical level before it saves the result. Scores, moves, stars, level completions, and game history are server-validated. The next level unlocks after completing the current one.

## Wallet and rewarded ads

The wallet shows your current coin balance and a dated transaction ledger. Signed-in players can purchase an available gameplay hint for 5 coins from the game screen; the server validates the price and records the debit. Insufficient balances do not reveal a hint. Other balances cannot be changed directly by players.

In development simulation mode, you can request bonus coins or a safe hint for an eligible active game. The server verifies the simulation, enforces cooldown/daily limits, and records coin grants in your wallet ledger; a rewarded hint is computed from the server-validated game session. The simulation is not an ad and no advertisement is shown. Rewarded ads are disabled in production until a real ad SDK and server-side provider verification adapter are installed and configured. Revive, double-score, extra-move, and booster reward types are not currently supported.

## Achievements

Achievements show locked/unlocked status and progress for level completions, apples, stars, perfect levels, and consecutive wins. Progress is based on server-validated game sessions and completed-level records.

## Administrator tools

Accounts with the admin role have an Admin navigation item for aggregate service statistics and reward configuration. Contact the project operator for account access; public registration creates player accounts only.
