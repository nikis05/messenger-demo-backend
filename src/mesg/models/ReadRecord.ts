import { User } from 'auth/models/User';
import { Lazy } from 'tsUtils';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Messenger } from './Messenger';

@Entity()
export class ReadRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(_with => User, { lazy: true, onDelete: 'CASCADE' })
  user!: Lazy<User>;

  @ManyToOne(_with => Messenger, { lazy: true, onDelete: 'CASCADE' })
  messenger!: Lazy<Messenger>;

  @Column()
  date!: Date;
}
