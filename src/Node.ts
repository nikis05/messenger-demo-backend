import { Field, ID, ObjectType } from 'type-graphql';
import { PrimaryGeneratedColumn } from 'typeorm';

@ObjectType()
export abstract class Node {
  @Field(_type => ID)
  @PrimaryGeneratedColumn('uuid')
  id!: string;
}
