import type { Knex } from "knex";
import { computeHash, replay, balancesToJson, balancesFromJson, type StoredEvent, type Balances } from "../domain/events.js";

interface EventRow {
  seq: number;
  type: string;
  account_id: string;
  asset: string;
  amount: string;
  hash: string;
  prev_hash: string | null;
}

function toDomain(row: EventRow): StoredEvent {
  return { seq: row.seq, type: row.type, accountId: row.account_id, asset: row.asset, amount: row.amount, hash: row.hash, prevHash: row.prev_hash };
}

export async function append(db: Knex, type: string, accountId: string, asset: string, amount: string): Promise<StoredEvent> {
  return db.transaction(async (trx) => {
    const last = await trx<EventRow>("events").orderBy("seq", "desc").first();
    const prevHash = last?.hash ?? null;
    const nextSeq = (last?.seq ?? 0) + 1;
    const hash = computeHash(prevHash, nextSeq, type, accountId, asset, amount);

    await trx<EventRow>("events").insert({ type, account_id: accountId, asset, amount, hash, prev_hash: prevHash });
    const inserted = await trx<EventRow>("events").where({ seq: nextSeq }).first();
    if (!inserted) throw new Error("Insert did not return the new event row");
    return toDomain(inserted);
  });
}

export async function listAll(db: Knex): Promise<StoredEvent[]> {
  const rows = await db<EventRow>("events").orderBy("seq", "asc").select();
  return rows.map(toDomain);
}

export async function listFrom(db: Knex, afterSeq: number): Promise<StoredEvent[]> {
  const rows = await db<EventRow>("events").where("seq", ">", afterSeq).orderBy("seq", "asc").select();
  return rows.map(toDomain);
}

export async function listUpTo(db: Knex, seq: number): Promise<StoredEvent[]> {
  const rows = await db<EventRow>("events").where("seq", "<=", seq).orderBy("seq", "asc").select();
  return rows.map(toDomain);
}

export async function rebuildFullState(db: Knex): Promise<Balances> {
  return replay(await listAll(db));
}

export async function takeSnapshot(db: Knex, upToSeq: number): Promise<void> {
  const balances = replay(await listUpTo(db, upToSeq));
  await db("event_snapshots").insert({ up_to_seq: upToSeq, balances_json: JSON.stringify(balancesToJson(balances)) });
}

interface SnapshotRow {
  up_to_seq: number;
  balances_json: string;
}

export async function stateAtSequence(db: Knex, atSeq: number): Promise<Balances> {
  const snapshot = await db<SnapshotRow>("event_snapshots").where("up_to_seq", "<=", atSeq).orderBy("up_to_seq", "desc").first();

  if (!snapshot) {
    return replay(await listUpTo(db, atSeq));
  }

  const startingBalances = balancesFromJson(JSON.parse(snapshot.balances_json) as Record<string, string>);
  const tail = (await listFrom(db, snapshot.up_to_seq)).filter((event) => event.seq <= atSeq);
  return replay(tail, startingBalances);
}
