import { User } from 'auth/models/User';
import { Node } from 'Node';
import { Lazy } from 'tsUtils';
import { Field, ObjectType } from 'type-graphql';
import { Column, CreateDateColumn, Entity, ManyToOne } from 'typeorm';
import { Messenger } from './Messenger';

@ObjectType()
@Entity()
export class Message extends Node {
  @ManyToOne(
    _with => Messenger,
    messenger => messenger.messages,
    { lazy: true, onDelete: 'CASCADE' }
  )
  messenger!: Lazy<Messenger>;

  @Field(_type => User)
  @ManyToOne(_with => User, { lazy: true, onDelete: 'CASCADE' })
  sender!: Lazy<User>;

  @Field()
  @Column()
  text!: string;

  @Field(_type => Message, { nullable: true })
  @ManyToOne(_with => Message, { lazy: true, onDelete: 'SET NULL' })
  respondsTo!: Lazy<Message | null>;

  @Field()
  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @Column()
  isEdited!: boolean;
}
