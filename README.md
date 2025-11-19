# Email App Backend

Deployment domain: 'https://email-app-backend-ecru.vercel.app'

Backend API for Email App with JWT Authentication, built with NestJS.

## 🚀 Features

- JWT Authentication (Access & Refresh Tokens)
- User Registration & Login
- Protected Email Endpoints
- Swagger API Documentation
- PostgreSQL Database Support (including Neon DB)
- Database Migrations
- User Seeding
- TypeScript
- CORS Configuration

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

## 📦 Installation

1. **Install dependencies:**

```bash
npm install
```

2. **Create `.env` file:**

```bash
# Copy and edit with your credentials
cp .env.example .env
```

3. **Configure environment variables** (see [Environment Variables](#-environment-variables) section)

4. **Run database migrations:**

```bash
npm run migration:run
```

5. **Seed initial users** (optional):

```bash
npm run seed:users
```

6. **Start development server:**

```bash
npm run start:dev
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
