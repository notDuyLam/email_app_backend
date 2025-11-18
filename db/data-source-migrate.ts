import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { getDatabaseConfig } from './connection-helper';

config();

const dbConfig = getDatabaseConfig();

export default new DataSource({
  type: 'postgres',
  ...dbConfig,
  entities: ['src/entities/**/*.entity.ts'],
  migrations: ['db/migrations/**/*.ts'],
  synchronize: false,
  logging: true,
} as any);

