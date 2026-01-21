import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export enum LabelType {
  SYSTEM = 'system',
  USER = 'user',
}

@Entity('labels')
@Unique(['userId', 'gmailLabelId'])
export class Label extends BaseEntity {
  @Column()
  @Index()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255, name: 'gmail_label_id' })
  @Index()
  gmailLabelId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: LabelType.USER,
  })
  type: string;
}
