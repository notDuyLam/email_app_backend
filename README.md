# Email App Backend

Backend API for Gmail Integration with Google OAuth 2.0 Authentication

## 🌐 Deployed URLs

- **Backend API**: [https://email-app-backend-ecru.vercel.app](https://email-app-backend-ecru.vercel.app)
- **API Documentation**: [https://email-app-backend-ecru.vercel.app/api/docs](https://email-app-backend-ecru.vercel.app/api/docs)
- **Frontend**: [https://mailbox-pro.vercel.app](https://mailbox-pro.vercel.app)

## 🚀 Features

- **Google OAuth 2.0** - Secure Gmail authentication
- **Gmail API Integration** - Full access to user's Gmail account
- **Token Management** - Access & Refresh tokens with auto-refresh
- **Email Operations** - Send, read, reply, forward, delete, archive, star emails
- **Attachment Handling** - Upload and download email attachments
- **Search & Pagination** - Gmail query syntax with pageToken pagination
- **Swagger Documentation** - Interactive API documentation
- **PostgreSQL Database** - User and token storage (Neon DB support)
- **TypeScript** - Full type safety
- **CORS Configuration** - Secure cross-origin requests

## 📋 Tech Stack

- **Framework**: NestJS 11
- **Language**: TypeScript 5.3
- **Database**: PostgreSQL (with Neon DB support)
- **ORM**: TypeORM
- **Authentication**: JWT, Passport
- **Documentation**: Swagger/OpenAPI
- **Validation**: class-validator, class-transformer

## 🛠️ Prerequisites

- Node.js 18+ (or Bun)
- PostgreSQL 12+ (or Neon DB account)
- Google Cloud Project with Gmail API enabled
- Google OAuth 2.0 credentials

## 📦 Local Setup & Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd email_app_backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up database

**Option A: Using Neon DB (Recommended)**

1. Create account at [Neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string

**Option B: Local PostgreSQL**

```bash
# Install PostgreSQL
# Create database
createdb email_app_db
```

### 4. Configure environment variables

Create a `.env` file in the root directory:

## 🔐 Google OAuth 2.0 Setup

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Gmail API**:
   - Navigate to "APIs & Services" > "Library"
## 📚 API Documentation

Interactive Swagger documentation available at:

- **Local**: `http://localhost:3000/api/docs`
- **Production**: `https://email-app-backend-ecru.vercel.app/api/docs`

## 🔌 API Endpoints

### Google OAuth Authentication

| Method | Endpoint                        | Description                          | Auth Required |
| ------ | ------------------------------- | ------------------------------------ | ------------- |
| GET    | `/api/auth/google/authorize`    | Initiate Google OAuth flow           | ❌            |
| GET    | `/api/auth/google/callback`     | OAuth callback handler               | ❌            |
| POST   | `/api/auth/refresh`             | Refresh access token                 | ❌            |
| POST   | `/api/auth/logout`              | Logout and revoke Google tokens      | ✅            |
| GET    | `/api/auth/me`                  | Get current user info                | ✅            |

### Gmail - Mailboxes

| Method | Endpoint               | Description                | Auth Required |
| ------ | ---------------------- | -------------------------- | ------------- |
| GET    | `/api/emails/mailboxes`| Get all Gmail labels       | ✅            |

### Gmail - Email Management
## 🔐 Authentication & Token Management

### OAuth 2.0 Flow

1. **User initiates login** - Frontend redirects to `/api/auth/google/authorize`
2. **Backend creates OAuth URL** - Includes required Gmail scopes
3. **User consents** - Google shows permission screen
4. **Google redirects back** - To `/api/auth/google/callback` with authorization code
5. **Backend exchanges code** - Gets access & refresh tokens from Google
6. **Backend stores tokens** - Encrypted in PostgreSQL database
7. **Backend creates session** - Sets HTTP-only cookies
8. **Frontend authenticated** - Can access Gmail API through backend

### Token Types

#### Access Token (15 minutes)
- **Purpose**: Authenticate API requests
- **Storage**: HTTP-only cookie
- **Lifespan**: 15 minutes
- **Refresh**: Auto-refreshed on 401 error

#### Refresh Token (7 days)
- **Purpose**: Get new access tokens
- **Storage**: HTTP-only cookie  
- **Lifespan**: 7 days
- **Security**: Can be revoked

#### Google Tokens
- **Access Token**: Google API authentication
- **Refresh Token**: Long-lived, stored encrypted in database
- **Scopes**: Gmail read, send, modify permissions

### Token Storage Security

#### Why HTTP-only Cookies?

✅ **Advantages**:
- **XSS Protection**: JavaScript cannot access tokens
- **Auto-transmission**: Sent automatically with requests
- **Secure flag**: HTTPS-only in production
- **SameSite**: CSRF protection
- **Path restriction**: Limited to API routes

❌ **Why NOT localStorage**:
- Accessible by any JavaScript code
- Vulnerable to XSS attacks
- No built-in security features
- Cannot set Secure or HttpOnly flags
- Persists across sessions

#### Implementation

```typescript
// Setting HTTP-only cookie (backend)
response.cookie('access_token', token, {
  httpOnly: true,           // No JavaScript access
  secure: process.env.NODE_ENV === 'production', // HTTPS only
  sameSite: 'lax',          // CSRF protection
  maxAge: 15 * 60 * 1000,   // 15 minutes
  path: '/api',             // Restrict to API routes
});
```

### Token Expiry Simulation

For demonstration, tokens expire quickly:

**Access Token**: 15 minutes
```typescript
// src/modules/auth/auth.service.ts
const expiresAt = new Date();
expiresAt.setMinutes(expiresAt.getMinutes() + 15);
```

**Testing expiry**:
```typescript
// Change to 1 minute for quick testing
expiresAt.setMinutes(expiresAt.getMinutes() + 1);
```

**Auto-refresh flow**:
1. Frontend makes API request
2. Backend returns 401 (token expired)
3. Frontend calls `/api/auth/refresh`
4. Backend issues new access token
5. Frontend retries original request
## 🗄️ Database

### Migrations

```bash
# Generate a new migration
npm run migration:generate -- db/migrations/MigrationName

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

### Database Schema

**Users Table**
- `id` - Primary key
- `email` - User email (unique)
- `name` - User display name
- `google_id` - Google account ID
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp

**Gmail Tokens Table**
- `id` - Primary key
- `user_id` - Foreign key to users
- `access_token` - Encrypted Google access token
## 🚀 Deployment

### Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel

# Deploy to production
vercel --prod
```

### Environment Variables in Vercel

Add these in Vercel dashboard (Settings > Environment Variables):

```env
NODE_ENV=production
FRONTEND_URL=https://mailbox-pro.vercel.app
DATABASE_URL=your_neon_db_connection_string
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=https://email-app-backend-ecru.vercel.app/api/auth/google/callback
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGIN=https://mailbox-pro.vercel.app
```

### Vercel Configuration

Create `vercel.json` in project root:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/main.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/main.js"
    }
  ]
}
```
**Connection pooling**:
- Neon handles connection pooling automatically
- No additional configuration needed
- Scales automatically with trafficled

6. **Database Security**
   - Connection string encrypted
   - SSL/TLS for database connection
   - Prepared statements prevent SQL injection credentials to `.env`:

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
FRONTEND_URL=http://localhost:5173
```

### Step 5: Publishing (Optional)

For production use beyond test users:
1. Complete OAuth consent screen verification
2. Submit for Google review
3. Wait for approval (can take several days)
4. Update redirect URIs with production URLs

**Note**: During testing, only added test users can authenticate.

# Database (Choose one option)
# Option 1: Neon DB Connection String
DATABASE_URL=postgresql://username:password@hostname/database?sslmode=require

# Option 2: Local PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=email_app_db

# Google OAuth 2.0
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
## 🧪 Testing

### Manual Testing

1. **OAuth Flow**:
   - Visit: `http://localhost:3000/api/auth/google/authorize`
   - Grant permissions
   - Should redirect to frontend with success

2. **Token Refresh**:
   - Wait 15 minutes
   - Make any API request
   - Should auto-refresh seamlessly

3. **API Endpoints**:
   - Use Swagger UI at `/api/docs`
   - Test each endpoint
   - Verify responses

### Test Gmail Account

You can use any Gmail account:
- Must be added as test user in Google Cloud Console (if app is unverified)
- Will grant access to real Gmail data
- All operations affect actual Gmail account

**Note**: Use a test Gmail account, not your primary account.

## 🐛 Troubleshooting

### "Unauthorized" errors

- Check if Google OAuth credentials are correct
- Verify redirect URI matches exactly
- Ensure Gmail API is enabled
- Check if access token expired (should auto-refresh)

### Database connection errors

- Verify DATABASE_URL is correct
- Check if database exists
- Run migrations: `npm run migration:run`
- For Neon DB, ensure SSL mode is enabled

### CORS errors

- Check FRONTEND_URL in .env
- Verify CORS_ORIGIN matches frontend URL
- Ensure credentials are included in requests

### Gmail API quota exceeded

- Check [Google Cloud Console](https://console.cloud.google.com/apis/api/gmail.googleapis.com/quotas)
- Default quota: 1 billion quota units/day
- Requests to increase quota if needed

### Token encryption errors

- Ensure JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are set
- Secrets must be at least 32 characters
- Use different secrets for access and refresh tokens

## 📝 Development Notes

- **Token Expiry**: 15 minutes (configurable for testing)
- **Database**: PostgreSQL with TypeORM
- **Google APIs**: Gmail API v1
- **Authentication**: OAuth 2.0 + HTTP-only cookies
- **API Rate Limits**: Respects Gmail API quotas

## 🔜 Future Enhancements

- [ ] Email drafts management
- [ ] Custom email labels
- [ ] Email filters and rules
- [ ] Scheduled email sending
- [ ] Email templates
- [ ] Analytics dashboard
- [ ] Webhook notifications
- [ ] Multi-account support

## 📄 License

Private - All rights reserved

## 👨‍💻 Contributors

- **notDuyLam** - Backend Development & Architecture
- **Luongsosad** - Frontend Integration & Testing start:dev

# Production mode
npm run build
npm run start:prod
```

The server will start at `http://localhost:3000`

## 📚 API Documentation

Swagger documentation is available at:

- **Swagger UI**: `http://localhost:3000/api/docs`

You can test all endpoints directly from the Swagger interface.

## 🔌 API Endpoints

### Authentication

| Method | Endpoint             | Description                    | Auth Required |
| ------ | -------------------- | ------------------------------ | ------------- |
| POST   | `/api/auth/register` | Register a new user            | ❌            |
| POST   | `/api/auth/login`    | Login with email/password      | ❌            |
| POST   | `/api/auth/refresh`  | Refresh access token           | ❌            |
| POST   | `/api/auth/logout`   | Logout user                    | ❌            |
| POST   | `/api/auth/google`   | Google OAuth (not implemented) | ❌            |

### Email (Protected)

| Method | Endpoint                    | Description                              | Auth Required |
| ------ | --------------------------- | ---------------------------------------- | ------------- |
| GET    | `/api/mailboxes`            | List all mailboxes                       | ✅            |
| GET    | `/api/mailboxes/:id/emails` | List emails in mailbox (with pagination) | ✅            |
| GET    | `/api/emails/:id`           | Get email detail by ID                   | ✅            |

### Health

| Method | Endpoint      | Description           | Auth Required |
| ------ | ------------- | --------------------- | ------------- |
| GET    | `/api/health` | Health check endpoint | ❌            |

## 🔐 Authentication

### Register

```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe" // optional
}
```

### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Using Protected Endpoints

Include the access token in the Authorization header:

```bash
Authorization: Bearer <accessToken>
```

## 🌍 Environment Variables

### Database Configuration

**Option 1: Neon DB Connection String (Recommended)**

```env
DATABASE_URL=postgresql://username:password@hostname/database?sslmode=require
```

**Option 2: Individual Database Variables**

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=email_app_db
```

### Application Configuration

```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### JWT Configuration

```env
JWT_ACCESS_SECRET=your-access-token-secret-key
JWT_REFRESH_SECRET=your-refresh-token-secret-key
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

## 🗄️ Database

### Migrations

```bash
# Generate a new migration
npm run migration:generate -- db/migrations/MigrationName

# Run pending migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

### Seeding

```bash
# Seed users (creates 4 test users)
npm run seed:users
```

**Seeded Users:**

- `lamdev@gmail.com` / `123`
- `luongdev@gmail.com` / `123`
- `nguyendev@gmail.com` / `123`
- `test@example.com` / `123`

## 🚀 Development

```bash
# Start development server with hot reload
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod

# Run linting
npm run lint

# Format code
npm run format
```

## 📝 Project Structure

```
backend/
├── db/
│   ├── migrations/          # Database migrations
│   ├── seeders/            # Database seeders
│   └── connection-helper.ts
├── src/
│   ├── common/             # Shared utilities
│   │   ├── decorators/     # Custom decorators
│   │   ├── filters/        # Exception filters
│   │   ├── guards/         # Auth guards
│   │   ├── interceptors/   # Response interceptors
│   │   └── strategies/     # Passport strategies
│   ├── configs/            # Configuration files
│   ├── entities/           # TypeORM entities
│   ├── modules/            # Feature modules
│   │   ├── auth/           # Authentication module
│   │   ├── email/          # Email module
│   │   └── health/         # Health check module
│   ├── app.module.ts       # Root module
│   └── main.ts             # Application entry point
└── package.json
```

## 🔗 Connecting to Neon DB

This project supports Neon DB connection strings. See the setup guide:

1. Get your connection string from [Neon Console](https://console.neon.tech)
2. Add to `.env`:
   ```env
   DATABASE_URL=postgresql://username:password@hostname/database?sslmode=require
   ```
3. Run migrations: `npm run migration:run`

For pgAdmin connection, parse the connection string:

- **Host**: hostname from connection string
- **Port**: 5432
- **Database**: database name
- **Username**: username from connection string
- **Password**: password from connection string
- **SSL Mode**: require

## 📄 License

DuyLaam
