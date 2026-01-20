# Email App Backend

A robust NestJS backend for a Gmail-integrated email application, featuring OAuth 2.0 authentication, database synchronization, and AI-powered semantic search.

## 🚀 Features

*   **Google OAuth 2.0 Integration**: Secure usage of Gmail API.
*   **Email Management**: Send, receive, reply, forward, archive, and delete emails.
*   **Database Sync**: PostgreSQL storage for metadata and local caching.
*   **AI Semantic Search**: Vector-based search using Elasticsearch/OpenAI/Gemini embeddings (configurable).
*   **Kanban Workflow**: API support for organizing emails in columns.
*   **Security**: HTTP-only cookies, automated token refreshing, and encrypted token storage.

## 🛠️ Setup Guide

### Prerequisites
*   Node.js (v18 or later)
*   PostgreSQL (or Neon DB)
*   Google Cloud Console Project with **Gmail API** enabled.

### Installation

1.  **Clone the repository**:
    ```bash
    git clone <your-repo-url>
    cd email_app_backend
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Configuration**:
    Create a `.env` file in the root directory:
    ```env
    # Database
    DATABASE_URL=postgresql://user:password@host:port/dbname

    # Authentication (JWT)
    JWT_ACCESS_SECRET=your_super_secret_access_key
    JWT_REFRESH_SECRET=your_super_secret_refresh_key
    JWT_ACCESS_EXPIRES_IN=15m
    JWT_REFRESH_EXPIRES_IN=7d

    # Google OAuth
    GOOGLE_CLIENT_ID=your_google_client_id
    GOOGLE_CLIENT_SECRET=your_google_client_secret
    GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

    # CORS
    FRONTEND_URL=http://localhost:5173
    ```

4.  **Database Migration**:
    ```bash
    npm run migration:run
    ```

5.  **Start the Server**:
    ```bash
    # Development
    npm run start:dev

    # Production
    npm run build
    npm run start:prod
    ```
    Server runs on `http://localhost:3000` by default.

## 🔐 Google OAuth Setup

1.  Go to [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project.
3.  Navigate to **APIs & Services > Library** and enable **Gmail API**.
4.  Go to **APIs & Services > Credentials** and creating **OAuth 2.0 Client IDs**.
5.  Configure **Authorized Redirect URIs** to include: `http://localhost:3000/api/auth/google/callback`.
6.  Copy the `Client ID` and `Client Secret` to your `.env` file.

## 🔑 Token Storage & Security

### Strategy
We prioritize security by **never** exposing sensitive tokens to the client-side JavaScript.

1.  **Access Tokens (Short-lived)**:
    *   Stored in **HTTP-Only Cookies**.
    *   Cannot be accessed via `document.cookie` (Mitigates XSS).
    *   Automatically sent with every API request.

2.  **Refresh Tokens (Long-lived)**:
    *   Stored in **HTTP-Only Cookies** (path restricted).
    *   Used to rotate access tokens automatically when they expire.

3.  **Google Tokens**:
    *   Stored encrypted in the **PostgreSQL** database (`gmail_tokens` table).
    *   Never sent to the frontend.

### Security Considerations
*   **CSRF Protection**: Cookies are set with `SameSite=Lax` (or `None` with `Secure` in production).
*   **Encryption**: Database tokens should be encrypted at rest (handled by application logic).
*   **Scopes**: We request only necessary Gmail scopes (`gmail.modify`, `gmail.readonly`, `gmail.send`).

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/auth/google/authorize` | Initiates Google OAuth flow. |
| `GET` | `/api/auth/google/callback` | Handles Google callback. |
| `POST` | `/api/auth/logout` | Clears cookies and session. |
| `GET` | `/api/auth/me` | Get current user profile. |

### Emails
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/emails/mailboxes` | List system mailboxes (Inbox, Sent, etc). |
| `GET` | `/api/emails/list/:labelId` | Get emails by label. |
| `GET` | `/api/emails/:id` | Get email details. |
| `POST` | `/api/emails/send` | Send a new email. |
| `POST` | `/api/emails/:id/reply` | Reply to an email. |
| `POST` | `/api/emails/:id/forward` | Forward an email. |
| `DELETE` | `/api/emails/:id` | Trash an email. |

*(Note: Full Swagger documentation available at `/api/docs` when server is running)*
