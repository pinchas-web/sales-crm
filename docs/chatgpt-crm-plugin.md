# ChatGPT CRM plugin

The plugin is an authenticated MCP server deployed as the Supabase Edge Function
`mcp`. It uses the existing Supabase users and Postgres data.

## What is exposed

Read tools:

- `get_profile`
- `list_active_leads`
- `get_lead`
- `list_followups`
- `list_active_clients`
- `get_onboarding_process`

Write tools (declared as non-read-only so ChatGPT asks for confirmation):

- `add_activity`
- `create_task`
- `update_lead`
- `set_onboarding_step`

Postgres RLS remains the final authorization boundary. Admins can access all CRM
records; salespeople can access records assigned to their CRM user ID.

## One-time production setup

1. In Supabase Auth, add an asymmetric JWT signing key (ES256 or RS256), rotate
   to it, and wait until access tokens signed with the old key have expired.
2. Enable the Supabase OAuth 2.1 server.
3. Set the authorization/consent path to `/oauth/consent` and enable Dynamic
   Client Registration.
4. Set the Auth Site URL to the production CRM origin. Add the production
   `/oauth/consent` URL to the allowed redirect URLs.
5. Apply migrations and deploy the function:

   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   npx supabase functions deploy mcp
   ```

6. Deploy the web app so the consent route is available.

The public MCP URL is:

```text
https://<project-ref>.supabase.co/functions/v1/mcp
```

## Connect ChatGPT

In ChatGPT, open **Settings → Plugins → Create**, enter the MCP URL above, and
complete the Supabase sign-in and consent flow. Keep the plugin private unless
the CRM is intentionally being shared with other users.

Test these prompts after connecting:

- “מהם הלידים הפעילים שלי כרגע?”
- “מהם השלבים של קליטת לקוח באימון מנטלי?”
- “הצג את הפולואפים עד יום חמישי.”
- “צור משימת שיחה לאסתי ליום שלישי.” (must show a confirmation before writing)

## Operational notes

- Never place a service-role key in ChatGPT or in a browser environment variable.
- Revoking the OAuth grant disconnects ChatGPT without changing the CRM password.
- A user removed from `crm_users` immediately loses MCP data access even if an
  OAuth token remains valid.
