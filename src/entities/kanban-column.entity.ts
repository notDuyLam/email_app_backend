import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Label } from './label.entity';

@Entity('kanban_columns')
@Unique(['userId', 'name'])
export class KanbanColumn extends BaseEntity {
  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'int', default: 0, name: 'column_order' })
  order: number;

  @Column({ nullable: true })
  labelId: number | null;

  @ManyToOne(() => Label, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'labelId' })
  label: Label;

  @Column({ type: 'boolean', default: false, name: 'is_default' })
  isDefault: boolean;
}
