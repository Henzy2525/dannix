# DANNIX Portfolio Backend

This project extends the existing static portfolio landing page with a secure Node.js and Express backend, PostgreSQL persistence, admin authentication, and a private dashboard for portfolio content management.

## Architecture overview

The frontend remains a static HTML/CSS/JS site. The public pages continue to render in the browser, while the backend exposes a REST API for:

- contact form submission
- public project listing and filtering
- authenticated admin dashboard operations
- contact message management
- analytics events
- optional email notifications

The public landing page stays in the root project folder and is served by Express. The admin dashboard is served from `/admin` and requires session-based authentication.

## Project structure

- `index.html` – public landing page
- `styles.css` – shared frontend styling
- `script.js` – frontend form handling and public API calls
- `public/admin/` – private admin dashboard UI
- `src/` – backend logic, validation, routes, middleware
- `src/db/schema.sql` – database schema and bootstrap SQL
- `scripts/create-admin.js` – initial admin user creation helper
- `.env.example` – environment variables with placeholders

## Local setup

1. Install Node.js 18+ and PostgreSQL 14+
2. Create a database named `portfolio_db` or update `DATABASE_URL`
3. Copy `.env.example` to `.env` and set your values
4. Run the database schema:

   ```bash
   psql $DATABASE_URL -f src/db/schema.sql
   ```

5. Install dependencies:

   ```bash
   npm install
   ```

6. Create the admin user:

   ```bash
   npm run create:admin
   ```

7. Start the app:

   ```bash
   npm start
   ```

8. Open:
   - `http://localhost:3000/` for the public landing page
   - `http://localhost:3000/admin` for the admin dashboard

## Public API

- `GET /api/health`
- `GET /api/projects`
- `POST /api/contact`
- `POST /api/analytics`

## Admin API

- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/overview`
- `GET /api/admin/projects`
- `POST /api/admin/projects`
- `PUT /api/admin/projects/:id`
- `DELETE /api/admin/projects/:id`
- `GET /api/admin/messages`
- `PATCH /api/admin/messages/:id/read`
- `DELETE /api/admin/messages/:id`
- `GET /api/admin/analytics`

## Security notes

- All admin routes are protected by server-side sessions
- Passwords are hashed with bcrypt
- Inputs are validated and sanitized on the server
- Rate limits are applied to authentication and contact endpoints
- PostgreSQL queries are parameterized
- Secrets remain in `.env` and are never exposed to the browser

## Production considerations

- Use a managed PostgreSQL service for production
- Set `NODE_ENV=production`
- Use a real PostgreSQL session store for production sessions if the app grows
- Configure SMTP or another verified mail provider before enabling email notifications
- Keep the admin dashboard on an authenticated private origin
- Use HTTPS and secure cookies in production

## Testing checklist

- Successful contact form submission
- Empty or invalid form fields
- Duplicate submission rate-limit behavior
- Database failure handling
- Email notification failure is logged without exposing provider details
- Admin login success and rejection
- Unauthorized admin access
- File upload validation for unsupported or oversized files

This project is intentionally designed to preserve the existing front-end styling and add server-side management without replacing the public experience.
