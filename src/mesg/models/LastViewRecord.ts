import { User } from 'auth/models/User';
import { Lazy } from 'tsUtils';
import { Entity, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Messenger } from './Messenger';

@Entity()
export class LastViewRecord {
  @PrimaryColumn()
  @ManyToOne(_with => User, { lazy: true })
  user!: Lazy<User>;

  @ManyToOne(_with => Messenger, { lazy: true })
  messenger!: Lazy<Messenger>;

  @UpdateDateColumn()
  date!: Date;
}
