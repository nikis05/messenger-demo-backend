import { UserInputError } from 'apollo-server-express';
import { UserService } from 'auth/services/UserService';
import { Context } from 'Context';
import { MessageCreateInput } from 'mesg/inputs/MessageCreateInput';
import { MessageWhereInput } from 'mesg/inputs/MessageWhereInput';
import { Message } from 'mesg/models/Message';
import { Arg, Ctx, ID, Mutation, Resolver } from 'type-graphql';
import { Inject, Service } from 'typedi';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { MessengerService } from './MessengerService';

@Service()
@Resolver(_of => Message)
export class MessageService {
  @InjectRepository(Message) private repo!: Repository<Message>;
  @Inject(_service => MessengerService)
  private messengerService!: MessengerService;
  @Inject(_service => UserService) private userService!: UserService;

  @Mutation(_returns => Message)
  async postMessage(
    @Arg('messengerId', _type => ID) messengerId: string,
    @Arg('input') input: MessageCreateInput,
    @Ctx() { callerId }: Context
  ): Promise<Message> {
    const message = this.repo.create(input);
    message.sender = await this.userService.findOne(callerId);
    message.messenger = await this.messengerService.accessOne({
      userId: callerId,
      messengerId
    });

    if (input.respondsToId) {
      const respondsToMessage = await this.repo.findOne({
        where: { id: input.respondsToId, messenger: { id: messengerId } }
      });
      if (!respondsToMessage)
        throw new UserInputError(
          'No respondsTo message with provided id found in this messenger'
        );
      message.respondsTo = respondsToMessage;
    }

    message.isEdited = false;

    await this.repo.save(message);
    return message;
  }

  @Mutation(_returns => Message)
  async editMessage(
    @Arg('id', _type => ID) id: string,
    @Arg('newText') newText: string,
    @Ctx() { callerId }: Context
  ): Promise<Message> {
    const message = await this.repo.findOne({ id, sender: { id: callerId } });
    if (!message)
      throw new UserInputError(
        'No message found with this id, or user is not its sender'
      );
    message.text = newText;
    message.isEdited = true;
    return this.repo.save(message);
  }

  @Mutation(_returns => ID)
  async deleteMessage(
    @Arg('id') id: string,
    @Ctx() { callerId }: Context
  ): Promise<string> {
    const messageCount = await this.repo.count({
      id,
      sender: { id: callerId }
    });
    if (messageCount === 0)
      throw new UserInputError(
        'No message found with this id, or user is not its sender'
      );
    await this.repo.delete(id);
    return id;
  }

  async findMany(
    messengerId: string,
    where: MessageWhereInput
  ): Promise<Message[]> {
    const { around, before, after } = where;
    if (around) {
      const aroundMessage = await this.repo.findOne({
        id: around,
        messenger: { id: messengerId }
      });
      if (!aroundMessage)
        throw new UserInputError('No message found with this id in messenger');

      return this.repo.manager.transaction('REPEATABLE READ', async manager => {
        const messagesBefore = await manager.find(Message, {
          where: {
            messenger: { id: messengerId },
            createdAt: LessThan(aroundMessage.createdAt)
          },
          order: { createdAt: 'DESC' },
          take: 14
        });

        const messagesAfter = await manager
          .find(Message, {
            where: {
              messenger: { id: messengerId },
              createdAt: MoreThan(
                new Date(aroundMessage.createdAt.getTime() + 1)
              )
            },
            order: { createdAt: 'ASC' },
            take: 15
          })
          .then(messages => messages.slice().reverse());

        return [...messagesAfter, aroundMessage, ...messagesBefore];
      });
    }

    return this.repo
      .find({
        where: {
          messenger: { id: messengerId },
          ...(before
            ? {
                createdAt: LessThan(before)
              }
            : {
                createdAt: MoreThan(new Date(after!.getTime() + 1))
              })
        },
        order: { createdAt: before ? 'DESC' : 'ASC' },
        take: 30
      })
      .then(messages => (after ? messages.slice().reverse() : messages));
  }

  count({
    messengerId,
    after
  }: {
    messengerId: string;
    after?: Date;
  }): Promise<number> {
    return this.repo.count({
      messenger: { id: messengerId },
      ...(after ? { createdAt: MoreThan(after) } : {})
    });
  }
}
