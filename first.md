How to get started
1. Install dependencies

cd macrocoats-api
npm install
2. Generate your RS256 keypair

openssl genrsa -out private.pem 4096
openssl rsa -in private.pem -pubout -out public.pem
# Then base64-encode them:
base64 -i private.pem | tr -d '\n'  # → JWT_PRIVATE_KEY_B64
base64 -i public.pem  | tr -d '\n'  # → JWT_PUBLIC_KEY_B64
3. Create .env.local (copy from .env.example)

cp .env.example .env.local
# Fill in: DATABASE_URL, JWT_PRIVATE_KEY_B64, JWT_PUBLIC_KEY_B64, COOKIE_SECRET
4. Push schema + seed

npm run db:push    # creates all 9 tables in Postgres
npm run seed       # inserts 5 products + all docs, 23 inventory items, 5 companies + users
5. Run dev server

npm run dev        # → http://localhost:3001/v1
6. Run tests

npm test           # integration tests hit the real DB
File map summary
Layer	Files
Config + Types	env.ts, types/index.ts, fastify.d.ts
DB Schema	9 Drizzle tables in src/db/schema/
Utilities	jwt.ts (RS256), crypto.ts (bcrypt), quotNumber.ts (atomic counter)
Plugins	cors.ts, cookie.ts, redis.ts (optional cache)
Middleware	authenticate → requireAuth → requireSuperAdmin / checkProductAccess → logAccess
Modules	auth, products, inventory, quotations, companies, analytics — each with schema/service/routes
Seed	Products (all 5 × TDS/MSDS/Formula/Label), Inventory (23 items), Companies (5 + users)
Tests	3 integration test files covering auth, product access gates, and inventory CRUD
Key security notes
All tokens in src/data/companyProductAccess.js on the frontend are hardcoded — rotate them via POST /v1/companies/:id/rotate-token immediately after first deploy
Formula/Label/CoA docs are superadmin-only at the API level — not just the frontend guard
httpOnly RS256 JWT cookies — no token is ever accessible to JavaScript