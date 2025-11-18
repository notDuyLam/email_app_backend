import { DataSourceOptions } from 'typeorm';

export function parseDatabaseUrl(databaseUrl?: string): Partial<DataSourceOptions> | null {
  if (!databaseUrl) {
    return null;
  }

  try {
    // Replace postgresql:// with http:// for URL parsing
    const url = new URL(databaseUrl.replace(/^postgresql:/, 'http:'));
    const sslMode = url.searchParams.get('sslmode');
    
    return {
      host: url.hostname,
      port: parseInt(url.port || '5432', 10),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1), // Remove leading '/'
      ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
    };
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error);
    return null;
  }
}

export function getDatabaseConfig(): Partial<DataSourceOptions> {
  const databaseUrl = process.env.DATABASE_URL;
  const parsed = parseDatabaseUrl(databaseUrl);

  if (parsed) {
    return parsed;
  }

  // Fallback to individual variables
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'email_app_db',
  };
}

