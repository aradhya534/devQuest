
export interface Asset {
  code: string;
  name: string;
  exponent: number;
}

export class AssetError extends Error {}

const REGISTRY = new Map<string, Asset>([
  ["USD", { code: "USD", name: "US Dollar", exponent: 2 }],
  ["EUR", { code: "EUR", name: "Euro", exponent: 2 }],
  ["JPY", { code: "JPY", name: "Japanese Yen", exponent: 0 }],
  ["BHD", { code: "BHD", name: "Bahraini Dinar", exponent: 2 }],
  ["BTC", { code: "BTC", name: "Bitcoin", exponent: 6 }],
]);

export function getAsset(code: string): Asset {
  const asset = REGISTRY.get(code);
  if (!asset) {
    throw new AssetError(`Unknown asset code: ${code}`);
  }
  return asset;
}

export function isKnownAsset(code: string): boolean {
  return REGISTRY.has(code.toUpperCase());
}

export function listAssets(): Asset[] {
  return [...REGISTRY.values()];
}
