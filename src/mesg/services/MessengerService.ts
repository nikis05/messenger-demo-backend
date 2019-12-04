import { ForbiddenError, UserInputError } from 'apollo-server-express';
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
  Int,
  Mutation,
  Query,
  Resolver,
  Root
} from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { MessageService } from './MessageService';
import { ReadRecordService } from './ReadRecordService';

@Service()
@Resolver(_of => Messenger)
export class MessengerService {
  @InjectRepository(Messenger) private repo!: Repository<Messenger>;
  @Inject(_service => UserService) private userService!: UserService;
  @Inject(_service => MessageService) private messageService!: MessageService;
  @Inject(_service => ReadRecordService)
  private readRecordService!: ReadRecordService;

  @Query(_returns => Messenger)
  messenger(
    @Arg('id', _type => ID) id: string,
    @Ctx() { callerId }: Context
  ): Promise<Messenger> {
    return this.accessOne({ userId: callerId, messengerId: id });
  }

  @Query(_returns => [Messenger])
  messengers(@Ctx() { callerId }: Context): Promise<Messenger[]> {
    return this.createMemberQb(callerId).getMany();
  }

  @Mutation(_returns => Messenger)
  async createMessenger(
    @Arg('input') input: MessengerCreateInput,
    @Ctx() { callerId }: Context
  ): Promise<Messenger> {
    const messenger = this.repo.create(input);
    const caller = await this.userService.findOne(callerId);
    messenger.admin = caller;

    const members = [caller];
    if (input.memberIds.length !== 0) {
      const otherMembers = await this.userService.findMany(input.memberIds);
      members.push(...otherMembers);
    }
    messenger.members = members;

    return this.repo.save(messenger);
  }

  @Mutation(_returns => ID)
  async deleteMessenger(
    @Arg('id', _type => ID) id: string,
    @Ctx() { callerId }: Context
  ): Promise<string> {
    const messenger = await this.accessOne({
      messengerId: id,
      userId: callerId,
      loadAdmin: true
    });

    if ((await messenger.admin).id !== callerId)
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
    const messenger = await this.accessOne({
      messengerId: id,
      userId: callerId,
      loadAdmin: true
    });

    if ((await messenger.admin).id === callerId)
      throw new ForbiddenError(
        'Admin cannot leave a messenger, use delete instead'
      );

    await this.repo
      .createQueryBuilder('messenger')
      .relation('members')
      .of(messenger)
      .remove(callerId);
    return id;
  }

  @Mutation(_returns => Messenger)
  async pinMessage(
    @Ctx() { callerId }: Context,
    @Arg('messengerId', _type => ID) messengerId: string,
    @Arg('messageId', _type => ID, { nullable: true }) messageId?: string
  ): Promise<Messenger> {
    const messenger = await this.createMemberQb(callerId)
      .leftJoinAndSelect('messenger.admin', 'admin')
      .leftJoinAndSelect(
        'messenger.messages',
        'message',
        'message.id = :messageId',
        { messageId }
      )
      .where('messenger.id = :messengerId', { messengerId })
      .getOne();

    if (!messenger)
      throw new UserInputError(
        'No messenger exists with this id, or you are not member of it'
      );

    if ((await messenger.admin).id !== callerId)
      throw new ForbiddenError('Only admin can pin a message');

    if (messageId === undefined)
      await this.repo
        .createQueryBuilder('messenger')
        .relation('pinnedMessage')
        .of(messenger)
        .set(null);
    else {
      const pinnedMessage = (await messenger.messages)[0];
      if (pinnedMessage === undefined)
        throw new Error('No message found in messenger with this id');

      await this.repo
        .createQueryBuilder('messenger')
        .relation('pinnedMessage')
        .of(messenger)
        .set(pinnedMessage);
    }

    return messenger;
  }

  @Mutation(_returns => Messenger)
  async markAsRead(
    @Arg('messengerId', _type => ID) messengerId: string,
    @Ctx() { callerId }: Context
  ): Promise<Messenger> {
    const messenger = await this.accessOne({ userId: callerId, messengerId });
    await this.readRecordService.setLastReadDate(
      callerId,
      messenger,
      new Date()
    );
    return this.repo.findOneOrFail(messengerId);
  }

  @FieldResolver(_returns => [Message])
  messages(
    @Root() messenger: Messenger,
    @Arg('where') where: MessageWhereInput
  ): Promise<Message[]> {
    return this.messageService.findMany(messenger.id, where);
  }

  @FieldResolver(_returns => Int)
  async numUnreadMessages(
    @Root() messenger: Messenger,
    @Ctx() { callerId }: Context
  ): Promise<number> {
    const lastReadDate = await this.readRecordService.getLastReadDate(
      callerId,
      messenger.id
    );

    return this.messageService.count({
      messengerId: messenger.id,
      after: lastReadDate || undefined
    });
  }

  async accessOne({
    userId,
    messengerId,
    loadAdmin
  }: {
    userId: string;
    messengerId: string;
    loadAdmin?: boolean;
  }): Promise<Messenger> {
    const qb = this.createMemberQb(userId).where(
      'messenger.id = :messengerId',
      {
        messengerId
      }
    );
    if (loadAdmin) qb.leftJoinAndSelect('messenger.admin', 'admin');

    const messenger = await qb.getOne();
    if (!messenger)
      throw new UserInputError(
        'No messenger found with this id, or caller is not member of it'
      );
    return messenger;
  }

  private createMemberQb(userId: string): SelectQueryBuilder<Messenger> {
    return this.repo
      .createQueryBuilder('messenger')
      .select()
      .innerJoin('messenger.members', 'member', 'member.id = :userId', {
        userId
      });
  }
}
