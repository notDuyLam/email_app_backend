import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmailStatus1765299802377 implements MigrationInterface {
  name = 'CreateEmailStatus1765299802377';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "email_statuses_status_enum" AS ENUM('inbox', 'todo', 'in-progress', 'done', 'snoozed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "email_statuses" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "userId" integer NOT NULL,
        "emailId" varchar(255) NOT NULL,
        "status" "email_statuses_status_enum" NOT NULL DEFAULT 'inbox',
        CONSTRAINT "PK_email_statuses_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_statuses_userId" ON "email_statuses" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_statuses_emailId" ON "email_statuses" ("emailId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_email_statuses_userId_emailId" ON "email_statuses" ("userId", "emailId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_statuses" ADD CONSTRAINT "FK_email_statuses_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_statuses" DROP CONSTRAINT "FK_email_statuses_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_email_statuses_userId_emailId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_email_statuses_emailId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_email_statuses_userId"`,
    );
    await queryRunner.query(`DROP TABLE "email_statuses"`);
    await queryRunner.query(`DROP TYPE "email_statuses_status_enum"`);
  }
}

