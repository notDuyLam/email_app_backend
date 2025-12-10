import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSnoozeAndSummaryFields1765358000000 implements MigrationInterface {
    name = 'AddSnoozeAndSummaryFields1765358000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add snooze and summary columns to email_statuses
        await queryRunner.query(`ALTER TABLE "email_statuses" ADD "snoozeUntil" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "email_statuses" ADD "summary" text`);
        await queryRunner.query(`ALTER TABLE "email_statuses" ADD "summarizedAt" TIMESTAMP`);
        
        // Create index on snoozeUntil for efficient querying of snoozed emails
        await queryRunner.query(`CREATE INDEX "IDX_email_statuses_snoozeUntil" ON "email_statuses" ("snoozeUntil") WHERE "snoozeUntil" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_email_statuses_snoozeUntil"`);
        await queryRunner.query(`ALTER TABLE "email_statuses" DROP COLUMN "summarizedAt"`);
        await queryRunner.query(`ALTER TABLE "email_statuses" DROP COLUMN "summary"`);
        await queryRunner.query(`ALTER TABLE "email_statuses" DROP COLUMN "snoozeUntil"`);
    }
}
