import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGmailTokens1764609803264 implements MigrationInterface {
  name = 'AddGmailTokens1764609803264';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "gmail_tokens" (
        "id" SERIAL NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        "userId" integer NOT NULL,
        "refreshToken" text NOT NULL,
        "accessToken" text,
        "accessTokenExpiry" TIMESTAMP,
        "isActive" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_b0de513194bb243b0aa4b012394" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f0cb19549ccb7ce44f010f9d06" ON "gmail_tokens" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "gmail_tokens" ADD CONSTRAINT "FK_f0cb19549ccb7ce44f010f9d062" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gmail_tokens" DROP CONSTRAINT "FK_f0cb19549ccb7ce44f010f9d062"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f0cb19549ccb7ce44f010f9d06"`,
    );
    await queryRunner.query(`DROP TABLE "gmail_tokens"`);
  }
}
