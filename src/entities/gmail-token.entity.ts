import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity('gmail_tokens')
export class GmailToken extends BaseEntity {
  @Column()
  @Index({ unique: true })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('text')
  refreshToken: string;

  @Column({ type: 'text', nullable: true })
  accessToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  accessTokenExpiry: Date | null;

  @Column({ default: true })
  isActive: boolean;
}
