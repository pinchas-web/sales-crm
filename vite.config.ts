import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createClient } from '@supabase/supabase-js'

function localForgotPasswordApi(): Plugin {
  return {
    name: 'local-forgot-password-api',
    configureServer(server) {
      server.middlewares.use('/api/auth/forgot-password', async (req, res, next) => {
        if (req.method !== 'POST') return next();

        try {
          const env = loadEnv('development', process.cwd(), '');
          const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
          const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

          if (!supabaseUrl || !serviceKey) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing Supabase server settings' }));
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk));
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as {
            email?: string;
            redirectTo?: string;
          };

          const email = body.email?.trim().toLowerCase();
          if (!email) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing email' }));
            return;
          }

          const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });

          const { data: approvedUser, error: approvedError } = await supabaseAdmin
            .from('crm_users')
            .select('auth_user_id')
            .ilike('email', email)
            .single();

          if (approvedError || !approvedUser) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Email is not approved in the CRM' }));
            return;
          }

          const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: body.redirectTo,
          });

          if (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message }));
            return;
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [localForgotPasswordApi(), react()],

  // נתיב מוחלט לVercel (לא יחסי כמו בתוסף WP)
  base: '/',

  server: {
    // פרוקסי לפיתוח מקומי — מעביר /api/* ל-Vercel dev server
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
