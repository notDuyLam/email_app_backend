import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeStatusToVarchar1765600000000 implements MigrationInterface {
  name = 'ChangeStatusToVarchar1765600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Convert enum column to varchar to support custom column IDs
    // Step 1: Remove the default value (which depends on the enum type)
    await queryRunner.query(`
      ALTER TABLE "email_statuses" 
      ALTER COLUMN "status" DROP DEFAULT;
    `);

    // Step 2: Alter the column type to varchar
    await queryRunner.query(`
      ALTER TABLE "email_statuses" 
      ALTER COLUMN "status" TYPE VARCHAR(255) 
      USING "status"::text;
    `);

    // Step 3: Set new default value as varchar
    await queryRunner.query(`
      ALTER TABLE "email_statuses" 
      ALTER COLUMN "status" SET DEFAULT 'inbox';
    `);

    // Step 4: Drop the enum type (now safe because no dependencies)
    await queryRunner.query(`
      DROP TYPE IF EXISTS "email_statuses_status_enum";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the enum type
    await queryRunner.query(`
      CREATE TYPE "email_statuses_status_enum" AS ENUM('inbox', 'todo', 'in-progress', 'done', 'snoozed');
    `);

    // Remove default value before converting
    await queryRunner.query(`
      ALTER TABLE "email_statuses" 
      ALTER COLUMN "status" DROP DEFAULT;
    `);

    // Convert back to enum (only valid enum values will be preserved)
    // Note: This might fail if there are custom column IDs in the database
    await queryRunner.query(`
      ALTER TABLE "email_statuses" 
      ALTER COLUMN "status" TYPE "email_statuses_status_enum" 
      USING CASE 
        WHEN "status" IN ('inbox', 'todo', 'in-progress', 'done', 'snoozed') 
        THEN "status"::"email_statuses_status_enum"
        ELSE 'inbox'::"email_statuses_status_enum"
      END;
    `);

    // Restore default value
    await queryRunner.query(`
      ALTER TABLE "email_statuses" 
      ALTER COLUMN "status" SET DEFAULT 'inbox'::"email_statuses_status_enum";
    `);
  }
}

