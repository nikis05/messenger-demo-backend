import { User } from 'auth/models/User';
import { Field, InputType } from 'type-graphql';

@InputType()
export class UserCreateInput implements Partial<User> {
  @Field()
  login!: string;

  @Field()
  password!: string;
}
