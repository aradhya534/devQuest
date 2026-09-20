import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("account_balances", (table) => {
    table.string("account_id").notNullable().references("id").inTable("accounts");
    table.string("asset").notNullable();
    table.string("available").notNullable().defaultTo("0");
    table.string("held").notNullable().defaultTo("0");
    table.primary(["account_id", "asset"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("account_balances");
}
