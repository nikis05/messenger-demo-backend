import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class MessageWhereInput {
  @Field({ nullable: true })
  before?: Date;

  @Field({ nullable: true })
  after?: Date;

  @Field(_type => ID, { nullable: true })
  around?: string;
}
