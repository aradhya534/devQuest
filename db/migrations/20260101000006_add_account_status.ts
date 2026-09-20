import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("accounts", (table) => {
    table.string("status").notNullable().defaultTo("pending");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("accounts", (table) => {
    table.dropColumn("status");
  });
}
