import { ForbiddenError, UserInputError } from 'apollo-server-express';
import { User } from 'auth/models/User';
import { UserService } from 'auth/services/UserService';
import { Context } from 'Context';
import { MessageWhereInput } from 'mesg/inputs/MessageWhereInput';
import { MessengerCreateInput } from 'mesg/inputs/MessengerCreateInput';
import { Message } from 'mesg/models/Message';
import { Messenger } from 'mesg/models/Messenger';
import {
  Arg,
  Ctx,
  FieldResolver,
  ID,
  Mutation,
  Query,
  Resolver,
  Root
} from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { MessageService } from './MessageService';

@Service()
@Resolver(_of => Messenger)
export class MessengerService {
  @InjectRepository(Messenger) private repo!: Repository<Messenger>;
  @Inject(_service => UserService) private userService!: UserService;
  @Inject(_service => MessageService) private messageService!: MessageService;

  @Query(_returns => [Messenger])
  activeMessengers(@Ctx() { callerId }: Context): Promise<Messenger[]> {
    return this.repo
      .createQueryBuilder('messenger')
      .select()
      .leftJoinAndSelect('messenger.members', 'member')
      .where('member.id = :callerId', { callerId })
      .getMany();
  }

  @Mutation(_returns => Messenger)
  createMessenger(
    @Arg('input') input: MessengerCreateInput,
    @Ctx() { callerId }: Context
  ): Promise<Messenger> {
    const messenger = this.repo.create(input);
    this.repo.merge(messenger, { admin: { id: callerId } });
    messenger.members = this.userService.findByIds(input.memberIds);
    return this.repo.save(messenger);
  }

  @Mutation(_returns => ID)
  async deleteMessenger(
    @Arg('id', _type => ID) id: string,
    @Ctx() { callerId }: Context
  ): Promise<string> {
    const messenger = await this.repo
      .createQueryBuilder('messenger')
      .select()
      .leftJoin('messenger.members', 'member', 'member.id = :callerId', {
        callerId
      })
      .leftJoinAndSelect('messenger.admin', 'admin')
      .where('messenger.id = :id', { id })
      .getOne();

    if (!messenger || (messenger.members as User[]).length === 0)
      throw new UserInputError(
        'No messenger exists with this id, or you are not member of it'
      );

    if ((messenger.admin as User).id !== callerId)
      throw new ForbiddenError(
        "You don't have permissions to delete this messenger"
      );

    await this.repo.remove(messenger);
    return id;
  }

  @Mutation(_returns => ID)
  async leaveMessenger(
    @Arg('id', _type => ID) id: string,
    @Ctx() { callerId }: Context
  ): Promise<string> {
    const messenger = await this.repo
      .createQueryBuilder('messenger')
      .select()
      .leftJoin('messenger.members', 'member', 'member.id = :callerId', {
        callerId
      })
      .leftJoinAndSelect('messenger.admin', 'admin')
      .where('messenger.id = :callerId', { callerId })
      .getOne();

    if (!messenger || (messenger.members as User[]).length === 0)
      throw new UserInputError(
        'No messenger exists with this id, or you are not member of it'
      );

    if ((messenger.admin as User).id === callerId)
      throw new ForbiddenError(
        'Admin cannot leave a messenger, use delete instead'
      );

    await this.repo
      .createQueryBuilder('messenger')
      .relation(User, 'members')
      .of(messenger)
      .remove(callerId);
    return id;
  }

  @Mutation(_returns => [Messenger])
  async pinMessage(
    @Arg('messengerId', _type => ID) messengerId: string,
    @Arg('messageId', _type => ID, { nullable: true }) messageId: string | null,
    @Ctx() { callerId }: Context
  ): Promise<Messenger> {
    const messenger = await this.repo
      .createQueryBuilder('messenger')
      .select()
      .leftJoin('messenger.members', 'member', 'member.id = :callerId', {
        callerId
      })
      .leftJoinAndSelect('messenger.admin', 'admin')
      .leftJoinAndSelect(
        'messenger.messages',
        'message',
        'message.id = :messageId',
        { messageId }
      )
      .where('messenger.id = :messengerId', { messengerId })
      .getOne();

    if (!messenger || (messenger.members as User[]).length === 0)
      throw new UserInputError(
        'No messenger exists with this id, or you are not member of it'
      );

    if (messageId === null) {
      await this.repo
        .createQueryBuilder('messenger')
        .relation(Message, 'pinnedMessage')
        .of(messenger)
        .set(null);
    } else {
      if ((messenger.messages as Message[]).length === 0)
        throw new Error('No message found in messenger with this id');

      await this.repo
        .createQueryBuilder('messenger')
        .relation(Message, 'pinnedMessage')
        .of(messenger)
        .set((messenger.messages as Message[])[0]);
    }

    return messenger;
  }

  @FieldResolver(_returns => [Message])
  messages(
    @Root() messenger: Messenger,
    @Arg('input') input: MessageWhereInput
  ): Promise<Message[]> {
    return this.messageService.findMany(messenger.id, input);
  }

  async userCanWriteTo(messengerId: string, callerId: string): Promise<void> {
    const messengerCount = await this.repo
      .createQueryBuilder('messenger')
      .select()
      .innerJoin('messenger.members', 'member', 'member.id = :callerId', {
        callerId
      })
      .where('messenger.id = :messengerId', { messengerId })
      .getCount();

    if (messengerCount === 0)
      throw new UserInputError(
        'No messenger found with this id, or caller is not member of it'
      );
  }
}
