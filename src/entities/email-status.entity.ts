import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export enum KanbanStatus {
  INBOX = 'inbox',
  TODO = 'todo',
  IN_PROGRESS = 'in-progress',
  DONE = 'done',
  SNOOZED = 'snoozed',
}

@Entity('email_statuses')
@Unique(['userId', 'emailId'])
export class EmailStatus extends BaseEntity {
  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  emailId: string;

  @Column({
    type: 'enum',
    enum: KanbanStatus,
    default: KanbanStatus.INBOX,
  })
  status: KanbanStatus;

  @Column({ type: 'timestamp', nullable: true })
  snoozeUntil: Date | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'timestamp', nullable: true })
  summarizedAt: Date | null;

  // Search-related columns for PostgreSQL Full-Text Search
  @Column({ type: 'text', nullable: true, name: 'subject' })
  subject: string | null;

  @Column({ type: 'text', nullable: true, name: 'sender_name' })
  senderName: string | null;

  @Column({ type: 'text', nullable: true, name: 'sender_email' })
  senderEmail: string | null;

  @Column({ type: 'text', nullable: true, name: 'snippet' })
  snippet: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'received_at' })
  receivedAt: Date | null;

  @Column({ type: 'tsvector', nullable: true, select: false, name: 'search_vector' })
  searchVector: string | null;

  // Semantic search columns for vector embeddings
  @Column({ type: 'text', nullable: true, name: 'body_text' })
  bodyText: string | null;

  // Embedding vector (768 dimensions for Gemini embedding-001)
  // TypeORM doesn't have native vector support, so we use 'text' type
  // and cast to vector in raw SQL queries
  @Column({ type: 'text', nullable: true, select: false })
  embedding: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'embedding_updated_at' })
  embeddingUpdatedAt: Date | null;
}

