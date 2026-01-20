import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVectorEmbeddingSupport1765500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add body_text column to store truncated email body (max 5000 chars)
    // This is needed even without pgvector for text storage
    await queryRunner.query(`
      ALTER TABLE email_statuses
      ADD COLUMN IF NOT EXISTS body_text TEXT;
    `);

    // Add embedding_updated_at timestamp
    await queryRunner.query(`
      ALTER TABLE email_statuses
      ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP;
    `);

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

    if (hasVectorExtension) {
      // Add embedding column (vector type with 768 dimensions for Gemini embedding-001)
      await queryRunner.query(`
        ALTER TABLE email_statuses
        ADD COLUMN IF NOT EXISTS embedding vector(768);
      `);

      // Create HNSW index on embedding column for fast approximate nearest neighbor search
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_email_embedding_hnsw 
        ON email_statuses USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64);
      `);

      // Create regular index on embedding_updated_at for filtering
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_email_embedding_updated_at 
        ON email_statuses (embedding_updated_at DESC);
      `);
    } else {
      // Without pgvector, store embedding as TEXT (JSON array) for potential future use
      await queryRunner.query(`
        ALTER TABLE email_statuses
        ADD COLUMN IF NOT EXISTS embedding TEXT;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes (safe to run even if they don't exist)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_email_embedding_hnsw;`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_email_embedding_updated_at;`,
    );

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE email_statuses
      DROP COLUMN IF EXISTS body_text,
      DROP COLUMN IF EXISTS embedding,
      DROP COLUMN IF EXISTS embedding_updated_at;
    `);
  }
}
