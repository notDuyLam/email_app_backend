import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFullTextSearchSupport1765400000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pg_trgm extension for fuzzy search (trigram similarity)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    // Add search-related columns to email_statuses table
    await queryRunner.query(`
      ALTER TABLE email_statuses
      ADD COLUMN IF NOT EXISTS subject TEXT,
      ADD COLUMN IF NOT EXISTS sender_name TEXT,
      ADD COLUMN IF NOT EXISTS sender_email TEXT,
      ADD COLUMN IF NOT EXISTS snippet TEXT,
      ADD COLUMN IF NOT EXISTS received_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS search_vector tsvector;
    `);

    // Create trigram indexes for fuzzy search (typo tolerance)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_subject_trgm 
      ON email_statuses USING gin (subject gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_sender_name_trgm 
      ON email_statuses USING gin (sender_name gin_trgm_ops);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_sender_email_trgm 
      ON email_statuses USING gin (sender_email gin_trgm_ops);
    `);

    // Create GIN index for full-text search on search_vector
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_search_vector 
      ON email_statuses USING gin (search_vector);
    `);

    // Create function to automatically update search_vector
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION email_search_vector_trigger() 
      RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := 
          setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'A') ||
          setweight(to_tsvector('english', COALESCE(NEW.sender_name, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.sender_email, '')), 'B') ||
          setweight(to_tsvector('english', COALESCE(NEW.snippet, '')), 'C');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create trigger to auto-update search_vector on INSERT/UPDATE
    await queryRunner.query(`
      CREATE TRIGGER email_search_vector_update 
      BEFORE INSERT OR UPDATE ON email_statuses
      FOR EACH ROW 
      EXECUTE FUNCTION email_search_vector_trigger();
    `);

    // Add indexes for filtering and sorting
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_received_at 
      ON email_statuses (received_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_user_status 
      ON email_statuses ("userId", status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger and function
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS email_search_vector_update ON email_statuses;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS email_search_vector_trigger();`,
    );

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_subject_trgm;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_sender_name_trgm;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_email_sender_email_trgm;`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_search_vector;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_received_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_user_status;`);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE email_statuses
      DROP COLUMN IF EXISTS subject,
      DROP COLUMN IF EXISTS sender_name,
      DROP COLUMN IF EXISTS sender_email,
      DROP COLUMN IF EXISTS snippet,
      DROP COLUMN IF EXISTS received_at,
      DROP COLUMN IF EXISTS search_vector;
    `);

    // Note: We don't drop pg_trgm extension as it might be used elsewhere
  }
}
