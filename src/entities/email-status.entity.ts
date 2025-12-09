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
}

