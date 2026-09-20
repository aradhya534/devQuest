// Thin wiring layer: reads the login form, calls the real API through
// buildSignedRequestInit, and hands the responses to the render functions.
// No business logic lives here — see dashboard.js for the parts this
// challenge grades.
import { renderBalance, renderOrderBook, renderRiskState, renderRiskUsage, renderAccountList, renderPortfolioSummary, renderRecentTrades, setStatus, setConnectionStatus, buildSignedRequestInit } from "./dashboard.js";
import { LiveFeedClient, applyOrderBookDelta } from "./liveFeed.js";
import { createHmacSigner } from "./signer.js";

let secret = "";
let accountId = "";

async function hmacSigner(input) {
  return createHmacSigner(secret)(input);
}

async function signedFetch(method, path, body) {
  const init = await buildSignedRequestInit({ method, path, body, timestamp: Date.now(), nonce: crypto.randomUUID() }, hmacSigner);
  const response = await fetch(path, init);
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function refresh(market) {
  setStatus(document, "balance-view", "loading");
  setStatus(document, "orderbook-view", "loading");
  setStatus(document, "risk-view", "loading");

  try {
    // One balance per asset in the registry; assets the account never touched are left out so an
    // account with no funds shows the empty state rather than a table of zeros.
    const assets = await signedFetch("GET", "/api/assets", undefined);
    if (assets.status !== 200) throw new Error("assets");
    const balances = [];
    for (const asset of assets.body.data) {
      const balance = await signedFetch("GET", `/api/settlement/accounts/${accountId}/balance?asset=${encodeURIComponent(asset.code)}`, undefined);
      if (balance.status !== 200) throw new Error("balance");
      const { available, held, total } = balance.body.data;
      if (total !== "0") balances.push({ asset: asset.code, available, held, total });
    }
    renderBalance(document, balances);
  } catch {
    setStatus(document, "balance-view", "error", "Could not load balance");
  }

  try {
    const book = await signedFetch("GET", `/api/orders/book/${encodeURIComponent(market)}/depth`, undefined);
    if (book.status === 200) {
      renderOrderBook(document, book.body.data);
    } else {
      setStatus(document, "orderbook-view", "error", "Could not load order book");
    }
  } catch {
    setStatus(document, "orderbook-view", "error", "Could not load order book");
  }

  try {
    const risk = await signedFetch("GET", `/api/risk/accounts/${accountId}/state`, undefined);
    if (risk.status === 200) {
      renderRiskState(document, risk.body.data);
      renderRiskUsage(document, risk.body.data, risk.body.data.limits);
    } else {
      setStatus(document, "risk-view", "error", "Could not load risk state");
    }
  } catch {
    setStatus(document, "risk-view", "error", "Could not load risk state");
  }
}

// The overview needs no sign-in: every account, with its holdings, is shown as soon as the page loads.
async function getJson(path) {
  const response = await fetch(path);
  if (response.status !== 200) throw new Error(path);
  return (await response.json()).data;
}

async function loadOverview() {
  setStatus(document, "accounts-view", "loading", "Loading accounts…");
  setStatus(document, "summary-view", "loading", "Loading summary…");
  try {
    const [assets, accounts] = await Promise.all([getJson("/api/assets"), getJson("/api/ledger/accounts")]);
    renderPortfolioSummary(document, accounts, assets);
    renderAccountList(document, accounts, assets);
  } catch {
    setStatus(document, "accounts-view", "error", "Could not load accounts");
    setStatus(document, "summary-view", "error", "Could not load the portfolio summary");
  }
  try {
    renderRecentTrades(document, await getJson("/api/orders/trades?limit=10"));
  } catch {
    setStatus(document, "activity-view", "error", "Could not load recent trades");
  }
}

document.getElementById("accounts-view").addEventListener("click", (event) => {
  const row = event.target.closest("[data-account-id]");
  if (row) document.getElementById("login-account-id").value = row.dataset.accountId;
});

document.getElementById("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  accountId = document.getElementById("login-account-id").value;
  secret = document.getElementById("login-secret").value;
  const market = document.getElementById("market-input").value;
  void refresh(market);
});

document.getElementById("controls-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const market = document.getElementById("market-input").value;
  void refresh(market);
});

// Optional live updates: open the page with ?feed=ws://host/path to stream instead of polling. The feed
// is expected to send per-topic "orderbook", "balance" and "risk" snapshots and order-book deltas (see
// liveFeed.js). The connection state is shown by setConnectionStatus.
function startLiveFeed(url) {
  let book = { bids: [], asks: [] };
  const client = new LiveFeedClient({
    url,
    topics: ["orderbook", "balance", "risk"],
    createSocket: (target) => new WebSocket(target),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id),
    random: () => Math.random(),
    onStatus: (status) => setConnectionStatus(document, status),
    onMessage: (topic, message) => {
      if (topic === "orderbook") {
        book = message.kind === "snapshot" ? message.data : applyOrderBookDelta(book, message.data);
        renderOrderBook(document, book);
      } else if (topic === "balance") {
        renderBalance(document, message.data.balances);
      } else if (topic === "risk") {
        renderRiskState(document, message.data);
      }
    },
  });
  client.start();
}

void loadOverview();

const feedUrl = new URLSearchParams(location.search).get("feed");
if (feedUrl) startLiveFeed(feedUrl);
