import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './modules/email/email.module';
import { HealthModule } from './modules/health/health.module';
import { GmailModule } from './modules/gmail/gmail.module';
import { SearchModule } from './modules/search/search.module';
import { KanbanModule } from './modules/kanban/kanban.module';
import { User } from './entities/user.entity';
import { GmailToken } from './entities/gmail-token.entity';
import { Email } from './entities/email.entity';
import { EmailVector } from './entities/email-vector.entity';
import { KanbanColumn } from './entities/kanban-column.entity';
import { SnoozeSchedule } from './entities/snooze-schedule.entity';
import { Label } from './entities/label.entity';
import appConfig from './configs/app.config';
import jwtConfig from './configs/jwt.config';
import gmailConfig from './configs/gmail.config';
import geminiConfig from './configs/gemini.config';
import embeddingConfig from './configs/embedding.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, gmailConfig, geminiConfig, embeddingConfig],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // Support Neon DB connection string or individual variables
        const databaseUrl = configService.get<string>('DATABASE_URL');

        if (databaseUrl) {
          // Parse connection string (for Neon DB)
          const url = new URL(databaseUrl.replace(/^postgresql:/, 'http:'));
          const sslMode = url.searchParams.get('sslmode');

          return {
            type: 'postgres',
            host: url.hostname,
            port: parseInt(url.port || '5432', 10),
            username: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
            database: url.pathname.slice(1),
            entities: [User, GmailToken, Email, EmailVector, KanbanColumn, SnoozeSchedule, Label],
            synchronize: false,
            logging: false,
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
          entities: [User, GmailToken, Email, EmailVector, KanbanColumn, SnoozeSchedule, Label],
          synchronize: false,
          logging: false,
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    EmailModule,
    HealthModule,
    GmailModule,
    SearchModule,
    KanbanModule,
  ],
})
export class AppModule {}
