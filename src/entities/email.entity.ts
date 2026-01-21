import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { KanbanColumn } from './kanban-column.entity';

@Entity('emails')
@Unique(['userId', 'gmailId'])
export class Email extends BaseEntity {
  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  gmailId: string;

  @Column({ nullable: true })
  @Index()
  kanbanColumnId: number;

  @ManyToOne(() => KanbanColumn, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'kanbanColumnId' })
  kanbanColumn: KanbanColumn;

  @Column({ type: 'text', nullable: true })
  subject: string | null;

  @Column({ type: 'text', nullable: true, name: 'sender_name' })
  senderName: string | null;

  @Column({ type: 'text', nullable: true, name: 'sender_email' })
  senderEmail: string | null;

  @Column({ type: 'text', nullable: true })
  snippet: string | null;

  @Column({ type: 'text', nullable: true, name: 'body_text' })
  bodyText: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'received_at' })
  receivedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'timestamp', nullable: true, name: 'summarized_at' })
  summarizedAt: Date | null;

  // Full-text search vector (PostgreSQL tsvector)
  @Column({
    type: 'tsvector',
    nullable: true,
    select: false,
    name: 'search_vector',
  })
  searchVector: string | null;
}
