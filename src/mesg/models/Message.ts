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
  @ManyToOne(_with => User)
  sender!: Lazy<User>;

  @Field()
  @Column()
  text!: string;

  @Field()
  @ManyToOne(_with => Message, { lazy: true })
  respondsTo!: Lazy<Message | null>;

  @CreateDateColumn()
  createdAt!: Date;

  @Field()
  @Column()
  isEdited!: boolean;
}
