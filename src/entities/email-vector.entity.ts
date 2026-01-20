import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { Email } from './email.entity';

@Entity('email_vectors')
export class EmailVector extends BaseEntity {
  @Column()
  @Index({ unique: true })
  emailId: number;

  @OneToOne(() => Email, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emailId' })
  email: Email;

  // Embedding vector (768 dimensions for Gemini embedding-001)
  // TypeORM doesn't have native vector support, so we use 'text' type
  // and cast to vector in raw SQL queries
  @Column({ type: 'text', nullable: true, select: false })
  embedding: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'embedding_updated_at' })
  embeddingUpdatedAt: Date | null;
}
