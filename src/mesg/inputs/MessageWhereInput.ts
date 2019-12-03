import { Field, InputType } from 'type-graphql';

@InputType()
export class MessageWhereInput {
  @Field({ nullable: true })
  before?: string;

  @Field({ nullable: true })
  after?: string;

  @Field({ nullable: true })
  around?: string;
}
