import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("accounts", (table) => {
    table.string("id").primary();
    table.string("type").notNullable(); // asset | liability | equity | revenue | expense
    table.string("name").notNullable().unique();
    table.string("available").notNullable().defaultTo("0"); // signed BigInt minor units, as text
    table.string("held").notNullable().defaultTo("0");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("ledger_entries", (table) => {
    table.increments("seq").primary();
    table.string("id").notNullable().unique();
    table.string("reversal_of_entry_id").references("id").inTable("ledger_entries");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("postings", (table) => {
    table.increments("seq").primary();
    table.string("id").notNullable().unique();
    table.string("entry_id").notNullable().references("id").inTable("ledger_entries");
    table.string("account_id").notNullable().references("id").inTable("accounts");
    table.string("asset").notNullable();
    table.string("amount").notNullable(); // signed BigInt minor units, as text
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.index(["account_id", "asset", "seq"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("postings");
  await knex.schema.dropTableIfExists("ledger_entries");
  await knex.schema.dropTableIfExists("accounts");
}
