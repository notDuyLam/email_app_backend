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
import { KanbanColumn } from './kanban-column.entity';

@Entity('snooze_schedules')
export class SnoozeSchedule extends BaseEntity {
  @Column()
  @Index({ unique: true })
  emailId: number;

  @OneToOne(() => Email, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'emailId' })
  email: Email;

  @Column({ type: 'timestamp', name: 'snooze_until' })
  @Index()
  snoozeUntil: Date;

  @Column({ nullable: true, name: 'return_to_column_id' })
  returnToColumnId: number | null;

  @ManyToOne(() => KanbanColumn, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'return_to_column_id' })
  returnToColumn: KanbanColumn;
}
