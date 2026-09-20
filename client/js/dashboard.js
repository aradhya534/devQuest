// Rendering functions for the operator dashboard. See tests/challenge12.test.ts and tests/challenge17.test.ts.

function notImplemented(where) {
  throw new Error(`${where} is not implemented yet.`);
}

export function setStatus(_doc, _sectionId, _state, _message) {
  notImplemented("setStatus");
}

// balances: Array<{ asset: string, available: string, held: string, total: string }>
export function renderBalance(_doc, _balances) {
  notImplemented("renderBalance");
}

// book: { bids: Array<{ price: string, quantity: string }>, asks: Array<{ price: string, quantity: string }> }
export function renderOrderBook(_doc, _book) {
  notImplemented("renderOrderBook");
}

// risk: { openOrderCount: number, committedExposure: string }
export function renderRiskState(_doc, _risk) {
  notImplemented("renderRiskState");
}

/**
 * @param {string} _amount
 * @param {number} _exponent
 * @returns {string}
 */
export function formatMinorUnits(_amount, _exponent) {
  notImplemented("formatMinorUnits");
}

// accounts: Array<{ id, type, name, status, balances: Array<{ asset, available, held, total }> }>; assets: Array<{ code, name, exponent }>
export function renderAccountList(_doc, _accounts, _assets) {
  notImplemented("renderAccountList");
}

export function renderPortfolioSummary(_doc, _accounts, _assets) {
  notImplemented("renderPortfolioSummary");
}

// state: { openOrderCount: number, committedExposure: string }; limits: { maxNotional: string, maxOpenOrders: number, maxPositionAbs: string }
export function renderRiskUsage(_doc, _state, _limits) {
  notImplemented("renderRiskUsage");
}

// trades: Array<{ market, buyOrderId, sellOrderId, price, quantity, timestampMs }>
export function renderRecentTrades(_doc, _trades) {
  notImplemented("renderRecentTrades");
}

export function setConnectionStatus(_doc, _status) {
  notImplemented("setConnectionStatus");
}

/**
 * @param {{ method: string, path: string, body: unknown, timestamp: number, nonce: string }} _input
 * @param {(input: unknown) => Promise<string>} _signer
 * @returns {Promise<{ headers: Record<string, string>, body?: string }>}
 */
export async function buildSignedRequestInit(_input, _signer) {
  notImplemented("buildSignedRequestInit");
}
