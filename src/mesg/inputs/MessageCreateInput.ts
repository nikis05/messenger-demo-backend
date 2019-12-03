import { Message } from 'mesg/models/Message';
import { Field, InputType } from 'type-graphql';

@InputType()
export class MessageCreateInput implements Partial<Message> {
  @Field()
  text!: string;

  @Field({ nullable: true })
  respondsToId?: string;
}
