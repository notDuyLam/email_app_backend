import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as bcrypt from 'bcrypt';
import { User } from '../../src/entities/user.entity';
import { getDatabaseConfig } from '../connection-helper';

config();

const dbConfig = getDatabaseConfig();

const AppDataSource = new DataSource({
  type: 'postgres',
  ...dbConfig,
  entities: ['src/entities/**/*.entity.ts'],
  synchronize: false,
  logging: true,
} as any);

async function seedUsers() {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established');

    const userRepository = AppDataSource.getRepository(User);

    // Check if users already exist
    const existingUsers = await userRepository.find({
      where: [
        { email: 'lamdev@gmail.com' },
        { email: 'luongdev@gmail.com' },
        { email: 'nguyendev@gmail.com' },
        { email: 'test@example.com' },
      ],
    });

    if (existingUsers.length > 0) {
      console.log('Some users already exist. Skipping seed...');
      console.log('Existing users:', existingUsers.map(u => u.email).join(', '));
      await AppDataSource.destroy();
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('123', 10);

    // Users to seed
    const users = [
      {
        email: 'lamdev@gmail.com',
        password: hashedPassword,
        name: 'Lam Dev',
      },
      {
        email: 'luongdev@gmail.com',
        password: hashedPassword,
        name: 'Luong Dev',
      },
      {
        email: 'nguyendev@gmail.com',
        password: hashedPassword,
        name: 'Nguyen Dev',
      },
      {
        email: 'test@example.com',
        password: hashedPassword,
        name: 'Test User',
      },
    ];

    // Insert users
    const createdUsers = await userRepository.save(users);

    console.log(`✅ Successfully seeded ${createdUsers.length} users:`);
    createdUsers.forEach((user) => {
      console.log(`  - ${user.email} (${user.name})`);
    });

    await AppDataSource.destroy();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error seeding users:', error);
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(1);
  }
}

seedUsers();

