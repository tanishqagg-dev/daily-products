export async function schemaReady(database){
 const rows=await database.sql`SELECT
  to_regclass('public.foldline_workspaces') IS NOT NULL
  AND to_regclass('public.foldline_requests') IS NOT NULL
  AND to_regclass('public.foldline_decisions') IS NOT NULL
  AND to_regclass('public.foldline_releases') IS NOT NULL
  AND to_regclass('public.foldline_release_requests') IS NOT NULL
  AND to_regclass('public.foldline_orders') IS NOT NULL
  AND to_regclass('public.foldline_webhook_events') IS NOT NULL
  AND to_regclass('public.foldline_intake_limits') IS NOT NULL AS ready`;
 return rows[0]?.ready===true;
}
