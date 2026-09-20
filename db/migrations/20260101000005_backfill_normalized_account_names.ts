import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("accounts", (table) => {
    table.string("normalized_name");
  });

  const accounts = await knex<{ id: string; name: string }>("accounts").select("id", "name");
  for (const account of accounts) {
    await knex("accounts")
      .where({ id: account.id })
      .update({ normalized_name: account.name.trim().toLowerCase() });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Keep the cleaned-up names once the derived column is gone.
  await knex.raw("UPDATE accounts SET name = normalized_name WHERE normalized_name IS NOT NULL");
  await knex.schema.alterTable("accounts", (table) => {
    table.dropColumn("normalized_name");
  });
}
