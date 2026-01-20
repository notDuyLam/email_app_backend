import { MigrationInterface, QueryRunner } from 'typeorm';

export class RedesignDatabaseSchema1766000000000 implements MigrationInterface {
  name = 'RedesignDatabaseSchema1766000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==========================================
    // 1. Drop old email_statuses table and related objects
    // ==========================================
    
    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS email_search_vector_update ON email_statuses;`);
    
    // Drop function
    await queryRunner.query(`DROP FUNCTION IF EXISTS email_search_vector_trigger();`);
    
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_embedding_hnsw;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_embedding_updated_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_subject_trgm;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_sender_name_trgm;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_sender_email_trgm;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_search_vector;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_received_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_user_status;`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_statuses_snoozeUntil";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_statuses_userId_emailId";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_statuses_emailId";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_email_statuses_userId";`);
    
    // Drop the table
    await queryRunner.query(`DROP TABLE IF EXISTS email_statuses CASCADE;`);
    
    // Drop old enum type if exists
    await queryRunner.query(`DROP TYPE IF EXISTS "email_statuses_status_enum";`);

    // ==========================================
    // 2. Ensure extensions are enabled
    // ==========================================
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    
    // Check if pgvector extension is available using SAVEPOINT
    // This allows us to recover from the error if extension is not available
    let hasVectorExtension = false;
    try {
      // Create a savepoint before attempting to create extension
      await queryRunner.query(`SAVEPOINT pgvector_check`);
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
      hasVectorExtension = true;
      // Release savepoint on success
      await queryRunner.query(`RELEASE SAVEPOINT pgvector_check`);
      console.log('pgvector extension enabled successfully');
    } catch (error) {
      // Rollback to savepoint to recover transaction
      await queryRunner.query(`ROLLBACK TO SAVEPOINT pgvector_check`);
      console.warn(
        'pgvector extension not available - semantic search will be disabled. ' +
        'To enable semantic search, install pgvector: https://github.com/pgvector/pgvector',
      );
    }

    // ==========================================
    // 3. Create labels table
    // ==========================================
    await queryRunner.query(`
      CREATE TABLE labels (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        gmail_label_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(50),
        type VARCHAR(20) DEFAULT 'user',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        UNIQUE("userId", gmail_label_id)
      );
    `);
    
    await queryRunner.query(`CREATE INDEX idx_labels_user_id ON labels("userId");`);
    await queryRunner.query(`CREATE INDEX idx_labels_gmail_label_id ON labels(gmail_label_id);`);

    // ==========================================
    // 4. Create kanban_columns table
    // ==========================================
    await queryRunner.query(`
      CREATE TABLE kanban_columns (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        column_order INTEGER DEFAULT 0,
        "labelId" INTEGER REFERENCES labels(id) ON DELETE SET NULL,
        is_default BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        UNIQUE("userId", name)
      );
    `);
    
    await queryRunner.query(`CREATE INDEX idx_kanban_columns_user_id ON kanban_columns("userId");`);
    await queryRunner.query(`CREATE INDEX idx_kanban_columns_order ON kanban_columns("userId", column_order);`);

    // ==========================================
    // 5. Create emails table
    // ==========================================
    await queryRunner.query(`
      CREATE TABLE emails (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "gmailId" VARCHAR(255) NOT NULL,
        "kanbanColumnId" INTEGER REFERENCES kanban_columns(id) ON DELETE SET NULL,
        subject TEXT,
        sender_name TEXT,
        sender_email TEXT,
        snippet TEXT,
        body_text TEXT,
        received_at TIMESTAMP,
        summary TEXT,
        summarized_at TIMESTAMP,
        search_vector tsvector,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        UNIQUE("userId", "gmailId")
      );
    `);
    
    // Create indexes for emails table
    await queryRunner.query(`CREATE INDEX idx_emails_user_id ON emails("userId");`);
    await queryRunner.query(`CREATE INDEX idx_emails_gmail_id ON emails("gmailId");`);
    await queryRunner.query(`CREATE INDEX idx_emails_kanban_column_id ON emails("kanbanColumnId");`);
    await queryRunner.query(`CREATE INDEX idx_emails_received_at ON emails(received_at DESC);`);
    
    // Create trigram indexes for fuzzy search
    await queryRunner.query(`CREATE INDEX idx_emails_subject_trgm ON emails USING gin (subject gin_trgm_ops);`);
    await queryRunner.query(`CREATE INDEX idx_emails_sender_name_trgm ON emails USING gin (sender_name gin_trgm_ops);`);
    await queryRunner.query(`CREATE INDEX idx_emails_sender_email_trgm ON emails USING gin (sender_email gin_trgm_ops);`);
    
    // Create GIN index for full-text search
    await queryRunner.query(`CREATE INDEX idx_emails_search_vector ON emails USING gin (search_vector);`);
    
    // Create function and trigger for auto-updating search_vector
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION emails_search_vector_trigger() 
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
    
    await queryRunner.query(`
      CREATE TRIGGER emails_search_vector_update 
      BEFORE INSERT OR UPDATE ON emails
      FOR EACH ROW 
      EXECUTE FUNCTION emails_search_vector_trigger();
    `);

    // ==========================================
    // 6. Create email_vectors table
    // ==========================================
    if (hasVectorExtension) {
      // With pgvector: use vector type for embeddings
      await queryRunner.query(`
        CREATE TABLE email_vectors (
          id SERIAL PRIMARY KEY,
          "emailId" INTEGER NOT NULL UNIQUE REFERENCES emails(id) ON DELETE CASCADE,
          embedding vector(768),
          embedding_updated_at TIMESTAMP,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "deletedAt" TIMESTAMP
        );
      `);
      
      await queryRunner.query(`CREATE INDEX idx_email_vectors_email_id ON email_vectors("emailId");`);
      
      // Create HNSW index for vector similarity search
      await queryRunner.query(`
        CREATE INDEX idx_email_vectors_embedding_hnsw 
        ON email_vectors USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
      `);
      
      await queryRunner.query(`CREATE INDEX idx_email_vectors_updated_at ON email_vectors(embedding_updated_at DESC);`);
    } else {
      // Without pgvector: use TEXT type for embeddings (JSON array)
      await queryRunner.query(`
        CREATE TABLE email_vectors (
          id SERIAL PRIMARY KEY,
          "emailId" INTEGER NOT NULL UNIQUE REFERENCES emails(id) ON DELETE CASCADE,
          embedding TEXT,
          embedding_updated_at TIMESTAMP,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "deletedAt" TIMESTAMP
        );
      `);
      
      await queryRunner.query(`CREATE INDEX idx_email_vectors_email_id ON email_vectors("emailId");`);
      await queryRunner.query(`CREATE INDEX idx_email_vectors_updated_at ON email_vectors(embedding_updated_at DESC);`);
    }

    // ==========================================
    // 7. Create snooze_schedules table
    // ==========================================
    await queryRunner.query(`
      CREATE TABLE snooze_schedules (
        id SERIAL PRIMARY KEY,
        "emailId" INTEGER NOT NULL UNIQUE REFERENCES emails(id) ON DELETE CASCADE,
        snooze_until TIMESTAMP NOT NULL,
        return_to_column_id INTEGER REFERENCES kanban_columns(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP
      );
    `);
    
    await queryRunner.query(`CREATE INDEX idx_snooze_schedules_email_id ON snooze_schedules("emailId");`);
    await queryRunner.query(`CREATE INDEX idx_snooze_schedules_snooze_until ON snooze_schedules(snooze_until);`);

    // ==========================================
    // 8. Seed default kanban columns for existing users
    // ==========================================
    await queryRunner.query(`
      INSERT INTO kanban_columns ("userId", name, column_order, is_default)
      SELECT id, 'Inbox', 0, true FROM users
      UNION ALL
      SELECT id, 'To Do', 1, true FROM users
      UNION ALL
      SELECT id, 'In Progress', 2, true FROM users
      UNION ALL
      SELECT id, 'Done', 3, true FROM users;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers and functions
    await queryRunner.query(`DROP TRIGGER IF EXISTS emails_search_vector_update ON emails;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS emails_search_vector_trigger();`);
    
    // Drop tables in reverse order (respecting foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS snooze_schedules CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS email_vectors CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS emails CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS kanban_columns CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS labels CASCADE;`);
    
    // Recreate the old email_statuses table structure
    await queryRunner.query(`CREATE TYPE "email_statuses_status_enum" AS ENUM('inbox', 'todo', 'in-progress', 'done', 'snoozed');`);
    
    await queryRunner.query(`
      CREATE TABLE email_statuses (
        id SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "emailId" VARCHAR(255) NOT NULL,
        status VARCHAR(255) DEFAULT 'inbox',
        "snoozeUntil" TIMESTAMP,
        summary TEXT,
        "summarizedAt" TIMESTAMP,
        subject TEXT,
        sender_name TEXT,
        sender_email TEXT,
        snippet TEXT,
        received_at TIMESTAMP,
        search_vector tsvector,
        body_text TEXT,
        embedding TEXT,
        embedding_updated_at TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP,
        UNIQUE("userId", "emailId")
      );
    `);
    
    await queryRunner.query(`CREATE INDEX "IDX_email_statuses_userId" ON email_statuses("userId");`);
    await queryRunner.query(`CREATE INDEX "IDX_email_statuses_emailId" ON email_statuses("emailId");`);
  }
}
