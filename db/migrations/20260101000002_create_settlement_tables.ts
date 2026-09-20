import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("idempotent_requests", (table) => {
    table.string("key").primary();
    table.string("request_hash").notNullable();
    table.text("response_json").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("idempotent_requests");
}
