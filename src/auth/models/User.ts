import { Node } from 'Node';
import { Lazy } from 'tsUtils';
import { Field, ObjectType } from 'type-graphql';
import { Column, Entity, OneToMany } from 'typeorm';
import { Session } from './Session';

@ObjectType()
@Entity()
export class User extends Node {
  @Field()
  @Column()
  login!: string;

  @Column()
  saltedPassword!: string;

  @OneToMany(
    _with => Session,
    session => session.user,
    {
      lazy: true
    }
  )
  sessions!: Lazy<Session[]>;
}
