import { Node } from 'Node';
import { Lazy } from 'tsUtils';
import { Field, ObjectType } from 'type-graphql';
import { Column, Entity, ManyToOne, UpdateDateColumn } from 'typeorm';
import { User } from './User';

@ObjectType()
@Entity()
export class Session extends Node {
  @ManyToOne(
    () => User,
    user => user.sessions,
    {
      lazy: true,
      nullable: false,
      onDelete: 'CASCADE'
    }
  )
  user!: Lazy<User>;

  @Column()
  refreshToken!: string;

  @Field()
  @UpdateDateColumn()
  lastUsed!: Date;
}
