// Where the shared scoreboard lives.
//
// The game is served by a small Node app that also answers /api, so the board is the same origin
// as the page at every size — local play, the droplet, and any future host. No CORS, no second
// hostname to keep alive.

export const API = '/api';
export const POLL_MS = 1500;
