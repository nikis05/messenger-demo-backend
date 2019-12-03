import { Messenger } from 'mesg/models/Messenger';
import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class MessengerCreateInput implements Partial<Messenger> {
  @Field()
  title!: string;

  @Field(_type => [ID])
  memberIds!: string[];
}
