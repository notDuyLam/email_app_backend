import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVectorEmbeddingSupport1765500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgvector extension for vector similarity search
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // Add body_text column to store truncated email body (max 5000 chars)
    await queryRunner.query(`
      ALTER TABLE email_statuses
      ADD COLUMN IF NOT EXISTS body_text TEXT;
    `);

    // Add embedding column (vector type with 768 dimensions for Gemini embedding-001)
    await queryRunner.query(`
      ALTER TABLE email_statuses
      ADD COLUMN IF NOT EXISTS embedding vector(768);
    `);

    // Add embedding_updated_at timestamp to track when embedding was generated
    await queryRunner.query(`
      ALTER TABLE email_statuses
      ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMP;
    `);

    // Create HNSW index on embedding column for fast approximate nearest neighbor search
    // HNSW is more efficient than ivfflat for similarity search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_embedding_hnsw 
      ON email_statuses USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    `);

    // Also create a regular index on embedding_updated_at for filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_email_embedding_updated_at 
      ON email_statuses (embedding_updated_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
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

    // Note: We don't drop vector extension as it might be used elsewhere
  }
}

