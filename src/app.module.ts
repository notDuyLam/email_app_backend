import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './modules/email/email.module';
import { HealthModule } from './modules/health/health.module';
import { User } from './entities/user.entity';
import appConfig from './configs/app.config';
import jwtConfig from './configs/jwt.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // Support Neon DB connection string or individual variables
        const databaseUrl = configService.get<string>('DATABASE_URL');
        
        if (databaseUrl) {
          // Parse connection string (for Neon DB)
          // Replace postgresql:// with http:// for URL parsing
          const url = new URL(databaseUrl.replace(/^postgresql:/, 'http:'));
          const sslMode = url.searchParams.get('sslmode');
          
          return {
            type: 'postgres',
            host: url.hostname,
            port: parseInt(url.port || '5432', 10),
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: url.pathname.slice(1), // Remove leading '/'
            entities: [User],
            synchronize: false,
            logging: configService.get<string>('NODE_ENV') === 'development',
            ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
          };
        }
        
        // Fallback to individual variables
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST') || 'localhost',
          port: parseInt(configService.get<string>('DB_PORT') || '5432', 10),
          username: configService.get<string>('DB_USERNAME') || 'postgres',
          password: configService.get<string>('DB_PASSWORD') || 'postgres',
          database: configService.get<string>('DB_DATABASE') || 'email_app_db',
          entities: [User],
          synchronize: false,
          logging: configService.get<string>('NODE_ENV') === 'development',
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    EmailModule,
    HealthModule,
  ],
})
export class AppModule {}

