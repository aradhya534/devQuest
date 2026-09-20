import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("events", (table) => {
    table.increments("seq").primary();
    table.string("type").notNullable();
    table.string("account_id").notNullable();
    table.string("asset").notNullable();
    table.string("amount").notNullable();
    table.string("hash").notNullable();
    table.string("prev_hash");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("event_snapshots", (table) => {
    table.integer("up_to_seq").primary();
    table.text("balances_json").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("event_snapshots");
  await knex.schema.dropTableIfExists("events");
}
