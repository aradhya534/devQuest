import type { RiskLimits, RiskState } from "../domain/risk.js";

const DEFAULT_LIMITS: RiskLimits = { maxNotional: 10_000_000n, maxOpenOrders: 50, maxPositionAbs: 1_000_000n };

const EMPTY_STATE: RiskState = { openOrderCount: 0, committedExposure: 0n };
const states = new Map<string, RiskState>();
const limitsByAccount = new Map<string, RiskLimits>();
let killSwitchEngaged = false;

export function getState(accountId: string): RiskState {
  return states.get(accountId) ?? EMPTY_STATE;
}

export function setState(accountId: string, state: RiskState): void {
  states.set(accountId, state);
}

export function getLimits(accountId: string): RiskLimits {
  return limitsByAccount.get(accountId) ?? [...limitsByAccount.values()][0] ?? DEFAULT_LIMITS;
}

export function setLimits(accountId: string, limits: RiskLimits): void {
  limitsByAccount.set(accountId, limits);
}

export function isKillSwitchEngaged(): boolean {
  return killSwitchEngaged;
}

export function setKillSwitch(engaged: boolean): void {
  killSwitchEngaged = engaged;
}

interface Reservation {
  accountId: string;
  side: "buy" | "sell";
  quantity: bigint;
}

const reservations = new Map<string, Reservation>();

export function registerReservation(orderId: string, reservation: Reservation): void {
  reservations.set(orderId, reservation);
}

export function takeReservation(orderId: string): Reservation | undefined {
  return reservations.get(orderId);
}

export function resetAll(): void {
  states.clear();
  limitsByAccount.clear();
  reservations.clear();
}
