import { User } from 'auth/models/User';
import { Node } from 'Node';
import { Lazy } from 'tsUtils';
import { Field, ObjectType } from 'type-graphql';
import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne
} from 'typeorm';
import { Message } from './Message';

@ObjectType()
@Entity()
export class Messenger extends Node {
  @Field()
  @Column()
  title!: string;

  @Field(_type => User)
  @ManyToOne(_with => User, { lazy: true, onDelete: 'CASCADE' })
  admin!: Lazy<User>;

  @Field(_type => User)
  @ManyToMany(_with => User, { lazy: true })
  @JoinTable()
  members!: Lazy<User[]>;

  @OneToMany(
    _with => Message,
    message => message.messenger,
    { lazy: true }
  )
  messages!: Lazy<Message[]>;

  @Field(_type => Message, { nullable: true })
  @OneToOne(_with => Message, {
    lazy: true,
    nullable: true,
    onDelete: 'SET NULL'
  })
  @JoinColumn()
  pinnedMessage!: Lazy<Message | null>;
}
