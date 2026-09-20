import fc from "fast-check";
import { JSDOM } from "jsdom";
import { expect, test, describe, beforeEach } from "vitest";
import { renderBalance, renderOrderBook, renderRiskState, buildSignedRequestInit, setStatus, formatMinorUnits } from "../client/js/dashboard.js";

let dom: JSDOM;

beforeEach(() => {
  dom = new JSDOM(`
    <!doctype html>
    <html>
      <body>
        <section id="balance-view"></section>
        <section id="orderbook-view"></section>
        <section id="risk-view"></section>
      </body>
    </html>
  `);
});

describe("Challenge 12: Operator Dashboard", () => {
  describe("Challenge 12a: Rendering real data", () => {
    test("Challenge 12a-1: the balance view renders one row per asset with available, held and total", () => {
      renderBalance(dom.window.document, [
        { asset: "USD", available: "100", held: "50", total: "150" },
        { asset: "BTC", available: "2", held: "0", total: "2" },
      ]);

      const section = dom.window.document.getElementById("balance-view");
      const rows = section?.querySelectorAll("tr") ?? [];
      expect(rows.length).toBe(3); // header + 2 data rows
      expect(section?.textContent).toContain("USD");
      expect(section?.textContent).toContain("150");
      expect(section?.textContent).toContain("BTC");
    });

    test("Challenge 12a-2: the order book view highlights the best bid and best ask", () => {
      renderOrderBook(dom.window.document, {
        bids: [{ price: "100", quantity: "5" }, { price: "99", quantity: "3" }],
        asks: [{ price: "101", quantity: "4" }, { price: "102", quantity: "2" }],
      });

      const section = dom.window.document.getElementById("orderbook-view");
      const bestBid = section?.querySelector(".bids .best");
      const bestAsk = section?.querySelector(".asks .best");
      expect(bestBid?.textContent).toContain("100");
      expect(bestAsk?.textContent).toContain("101");
    });

    test("Challenge 12a-3: the risk view shows open order count and committed exposure", () => {
      renderRiskState(dom.window.document, { openOrderCount: 3, committedExposure: "250" });

      const section = dom.window.document.getElementById("risk-view");
      expect(section?.textContent).toContain("3");
      expect(section?.textContent).toContain("250");
    });
  });

  describe("Challenge 12b: Untrusted data never executes", () => {
    test("Challenge 12b-1: an asset name containing markup renders as literal text, not as an element", () => {
      renderBalance(dom.window.document, [{ asset: "<img src=x onerror=alert(1)>", available: "1", held: "0", total: "1" }]);

      const section = dom.window.document.getElementById("balance-view");
      expect(section?.querySelector("img")).toBeNull();
      expect(section?.textContent).toContain("<img src=x onerror=alert(1)>");

      renderOrderBook(dom.window.document, { bids: [{ price: "<img src=x onerror=alert(1)>", quantity: "1" }], asks: [] });
      const book = dom.window.document.getElementById("orderbook-view");
      expect(book?.querySelector("img")).toBeNull();
      expect(book?.textContent).toContain("<img src=x onerror=alert(1)>");

      renderRiskState(dom.window.document, { openOrderCount: 1, committedExposure: "<img src=x onerror=alert(2)>" });
      const risk = dom.window.document.getElementById("risk-view");
      expect(risk?.querySelector("img")).toBeNull();
      expect(risk?.textContent).toContain("<img src=x onerror=alert(2)>");
    });
  });

  describe("Challenge 12c: Distinguishable loading, empty and error states", () => {
    test("Challenge 12c-1: an empty balance list renders a distinct empty state, not an empty table", () => {
      renderBalance(dom.window.document, []);

      const section = dom.window.document.getElementById("balance-view");
      expect(section?.dataset.state).toBe("empty");
      expect(section?.querySelector("table")).toBeNull();
      expect(section?.textContent?.trim()).not.toBe("");
    });

    test("Challenge 12c-2: rendered data marks the section ready, distinct from empty or loading", () => {
      renderRiskState(dom.window.document, { openOrderCount: 0, committedExposure: "0" });

      const section = dom.window.document.getElementById("risk-view");
      expect(section?.dataset.state).toBe("ready");
    });

    test("Challenge 12c-3: a loading state is visibly distinct from empty, error and ready", () => {
      setStatus(dom.window.document, "balance-view", "loading", "Loading balances…");

      const section = dom.window.document.getElementById("balance-view");
      expect(section?.dataset.state).toBe("loading");
      expect(section?.textContent).toContain("Loading");
    });

    test("Challenge 12c-4: an error state is visibly distinct from empty, loading and ready", () => {
      setStatus(dom.window.document, "risk-view", "error", "Failed to load risk state");

      const section = dom.window.document.getElementById("risk-view");
      expect(section?.dataset.state).toBe("error");
      expect(section?.textContent).toContain("Failed to load risk state");
    });

    test("Challenge 12c-5: an empty order book renders a distinct empty state, not empty columns", () => {
      renderOrderBook(dom.window.document, { bids: [], asks: [] });

      const section = dom.window.document.getElementById("orderbook-view");
      expect(section?.dataset.state).toBe("empty");
      expect(section?.textContent?.trim()).not.toBe("");
      expect(section?.querySelectorAll(".bids").length).toBe(0);
      expect(section?.querySelectorAll(".asks").length).toBe(0);

      // A one-sided book is real market state, not an empty one.
      renderOrderBook(dom.window.document, { bids: [{ price: "100", quantity: "5" }], asks: [] });

      expect(section?.dataset.state).toBe("ready");
      expect(section?.querySelector(".bids .best")?.textContent).toContain("100");

      // An asks-only book is also real market state, not an empty one -- and closes the loop
      // against an implementation that only checks bids.length (ignoring asks entirely).
      renderOrderBook(dom.window.document, { bids: [], asks: [{ price: "101", quantity: "4" }] });

      expect(section?.dataset.state).toBe("ready");
      expect(section?.querySelector(".asks .best")?.textContent).toContain("101");
    });
  });

  describe("Challenge 12d: Client-side HMAC signing", () => {
    test("Challenge 12d-1: the built request carries the signature, timestamp and nonce the server expects", async () => {
      const seen: unknown[] = [];
      const fakeSigner = async (input: unknown): Promise<string> => {
        seen.push(input);
        return "fake-signature";
      };

      const init = await buildSignedRequestInit({ method: "POST", path: "/api/orders", body: { accountId: "a1" }, timestamp: 1700000000000, nonce: "abc123" }, fakeSigner);

      expect(init.headers["X-Signature"]).toBe("fake-signature");
      expect(init.headers["X-Signature-Algorithm"]).toBe("HMAC-SHA256");
      expect(init.headers["X-Timestamp"]).toBe("1700000000000");
      expect(init.headers["X-Nonce"]).toBe("abc123");
      expect(init.body).toBe(JSON.stringify({ accountId: "a1" }));
      expect(seen).toEqual([{ method: "POST", path: "/api/orders", rawBody: JSON.stringify({ accountId: "a1" }), timestamp: 1700000000000, nonce: "abc123" }]);
    });

    test("Challenge 12d-2: a request with no body signs an undefined rawBody, not the string \"undefined\"", async () => {
      const seen: unknown[] = [];
      const fakeSigner = async (input: unknown): Promise<string> => {
        seen.push(input);
        return "fake-signature";
      };
      const init = await buildSignedRequestInit({ method: "GET", path: "/api/orders/book/BTC-USD", body: undefined, timestamp: 1700000000000, nonce: "xyz" }, fakeSigner);

      expect(init.body).toBeUndefined();
      expect(seen).toHaveLength(1);
      expect((seen[0] as { rawBody?: unknown }).rawBody).toBeUndefined();
      expect(init.headers["X-Signature"]).toBe("fake-signature");
    });
  });

  describe("Challenge 12e: Exact money formatting", () => {
    test("Challenge 12e-1: formatMinorUnits matches an exact BigInt oracle for any amount, sign, leading zeros and exponent", () => {
      fc.assert(
        fc.property(fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }), fc.integer({ min: 0, max: 18 }), fc.nat(3), (value, exponent, zeros) => {
          const negative = value < 0n;
          const abs = negative ? -value : value;
          const scale = 10n ** BigInt(exponent);
          const whole = (abs / scale).toString();
          const fraction = (abs % scale).toString().padStart(exponent, "0");
          const expected = (negative && abs !== 0n ? "-" : "") + (exponent === 0 ? whole : whole + "." + fraction);

          const input = (negative ? "-" : "") + "0".repeat(zeros) + abs.toString();
          expect(formatMinorUnits(input, exponent)).toBe(expected);
        }),
      );
    });

    test("Challenge 12e-2: small fractions, zero and exponent 0 format correctly, and malformed input throws RangeError", () => {
      expect(formatMinorUnits("0", 2)).toBe("0.00");
      expect(formatMinorUnits("-0", 2)).toBe("0.00");
      expect(formatMinorUnits("5", 2)).toBe("0.05");
      expect(formatMinorUnits("-5", 2)).toBe("-0.05");
      expect(formatMinorUnits("700", 0)).toBe("700");
      expect(formatMinorUnits("100000000", 8)).toBe("1.00000000");
      expect(formatMinorUnits("12345678901234567890123", 3)).toBe("12345678901234567890.123");

      for (const bad of ["1.5", "", "abc", " 5", "5 ", "--5", "1e3"]) {
        expect(() => formatMinorUnits(bad, 2)).toThrow(RangeError);
      }
      expect(() => formatMinorUnits(5 as unknown as string, 2)).toThrow(RangeError);
      for (const exponent of [-1, 19, 1.5, Number.NaN]) {
        expect(() => formatMinorUnits("5", exponent)).toThrow(RangeError);
      }
    });
  });

  describe("Challenge 12f: Order book presentation", () => {
    const levelArb = fc.uniqueArray(fc.integer({ min: 1, max: 100000 }), { minLength: 1, maxLength: 10 });
    const rowTexts = (selector: string): string[] => [...dom.window.document.querySelectorAll(selector)].map((el) => el.textContent ?? "");

    test("Challenge 12f-1: each side renders best price first whatever order the API returns, with only the first row marked best", () => {
      fc.assert(
        fc.property(levelArb, levelArb, fc.integer({ min: 1, max: 50 }), (bidPrices, askPrices, quantity) => {
          dom = new JSDOM('<!doctype html><section id="orderbook-view"></section>');
          const bids = bidPrices.map((price) => ({ price: String(price), quantity: String(quantity) }));
          const asks = askPrices.map((price) => ({ price: String(price), quantity: String(quantity) }));
          renderOrderBook(dom.window.document, { bids, asks });

          const expectedBids = [...bidPrices].sort((a, b) => b - a).map((price) => price + " x " + quantity);
          const expectedAsks = [...askPrices].sort((a, b) => a - b).map((price) => price + " x " + quantity);
          expect(rowTexts(".bids > div")).toEqual(expectedBids);
          expect(rowTexts(".asks > div")).toEqual(expectedAsks);
          expect(dom.window.document.querySelectorAll(".bids .best").length).toBe(1);
          expect(dom.window.document.querySelectorAll(".asks .best").length).toBe(1);
          expect(dom.window.document.querySelector(".bids > div")?.classList.contains("best")).toBe(true);
          expect(dom.window.document.querySelector(".asks > div")?.classList.contains("best")).toBe(true);
        }),
      );
    });

    test("Challenge 12f-2: a deep book is capped at ten levels with a '+N more' row, and malformed prices never break the render", () => {
      const bids = Array.from({ length: 25 }, (_, i) => ({ price: String(1000 - i), quantity: "1" })).reverse();
      const exactlyTen = Array.from({ length: 10 }, (_, i) => ({ price: String(2000 + i), quantity: "1" }));
      renderOrderBook(dom.window.document, { bids, asks: exactlyTen });

      const shownBids = rowTexts(".bids > div:not(.more)");
      expect(shownBids).toHaveLength(10);
      expect(shownBids[0]).toBe("1000 x 1");
      expect(shownBids[9]).toBe("991 x 1");
      expect(rowTexts(".bids .more")).toEqual(["+15 more"]);
      expect(rowTexts(".asks > div:not(.more)")).toHaveLength(10);
      expect(dom.window.document.querySelectorAll(".asks .more").length).toBe(0);

      const hostile = "<img src=x onerror=alert(1)>";
      expect(() =>
        renderOrderBook(dom.window.document, {
          bids: [{ price: "abc", quantity: "1" }, { price: "5", quantity: "2" }, { price: hostile, quantity: "3" }, { price: "", quantity: "4" }],
          asks: [{ price: "9", quantity: "1" }],
        }),
      ).not.toThrow();
      const book = dom.window.document.getElementById("orderbook-view");
      expect(book?.textContent).toContain(hostile);
      expect(book?.querySelectorAll("img").length).toBe(0);
    });
  });

  describe("Challenge 12g: Accessibility", () => {
    test("Challenge 12g-1: loading sets aria-busy, errors announce themselves with role=alert, and tables have a caption and column headers", () => {
      const doc = dom.window.document;
      const section = doc.getElementById("balance-view");

      setStatus(doc, "balance-view", "loading", "Loading balances…");
      expect(section?.getAttribute("aria-busy")).toBe("true");
      expect(section?.hasAttribute("role")).toBe(false);

      setStatus(doc, "balance-view", "error", "Could not load balances");
      expect(section?.getAttribute("role")).toBe("alert");
      expect(section?.getAttribute("aria-busy")).toBe("false");

      renderBalance(doc, [{ asset: "USD", available: "1", held: "0", total: "1" }]);
      expect(section?.getAttribute("aria-busy")).toBe("false");
      expect(section?.hasAttribute("role")).toBe(false);
      expect(section?.querySelector("table > caption")?.textContent?.trim()).not.toBe("");
      const headers = [...(section?.querySelectorAll("th") ?? [])];
      expect(headers.length).toBe(4);
      expect(headers.every((th) => th.getAttribute("scope") === "col")).toBe(true);

      setStatus(doc, "risk-view", "error", "Failed");
      renderRiskState(doc, { openOrderCount: 0, committedExposure: "0" });
      expect(doc.getElementById("risk-view")?.hasAttribute("role")).toBe(false);
      expect(doc.getElementById("risk-view")?.getAttribute("aria-busy")).toBe("false");
    });
  });
});
