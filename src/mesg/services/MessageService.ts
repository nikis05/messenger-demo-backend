import { UserInputError } from 'apollo-server-express';
import { UserService } from 'auth/services/UserService';
import { Context } from 'Context';
import { MessageCreateInput } from 'mesg/inputs/MessageCreateInput';
import { MessageWhereInput } from 'mesg/inputs/MessageWhereInput';
import { Message } from 'mesg/models/Message';
import {
  Arg,
  Ctx,
  ID,
  Mutation,
  PubSub,
  PubSubEngine,
  Resolver,
  Root,
  Subscription
} from 'type-graphql';
import Container, { Inject, Service } from 'typedi';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { MessengerService } from './MessengerService';

const subscriptionsFilterFn = async ({
  payload,
  args,
  context
}: {
  payload: { messengerId: string };
  args: { messengerId: string };
  context: Context;
}) => {
  return (
    payload.messengerId === args.messengerId &&
    Container.get(MessengerService).userCanAccess(
      context.callerId,
      payload.messengerId
    )
  );
};

@Service()
@Resolver(_of => Message)
export class MessageService {
  private static SubscriptionTopics = {
    MessagePosted: 'MessagePosted',
    MessageEdited: 'MessageEdited',
    MessageDeleted: 'MessageDeleted'
  };

  @InjectRepository(Message) private repo!: Repository<Message>;
  @Inject(_service => MessengerService)
  private messengerService!: MessengerService;
  @Inject(_service => UserService) private userService!: UserService;

  @Mutation(_returns => Message)
  async postMessage(
    @Ctx() { callerId }: Context,
    @PubSub() pubSub: PubSubEngine,
    @Arg('messengerId', _type => ID) messengerId: string,
    @Arg('input') input: MessageCreateInput
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

    await pubSub.publish(MessageService.SubscriptionTopics.MessagePosted, {
      messengerId,
      message
    });
    return message;
  }

  @Mutation(_returns => Message)
  async editMessage(
    @Ctx() { callerId }: Context,
    @PubSub() pubSub: PubSubEngine,
    @Arg('id', _type => ID) id: string,
    @Arg('newText') newText: string
  ): Promise<Message> {
    const message = await this.repo.findOne({
      where: { id, sender: { id: callerId } },
      relations: ['messenger']
    });
    if (!message)
      throw new UserInputError(
        'No message found with this id, or user is not its sender'
      );

    message.text = newText;
    message.isEdited = true;
    await this.repo.save(message);

    await pubSub.publish(MessageService.SubscriptionTopics.MessageEdited, {
      messengerId: (await message.messenger).id,
      message
    });
    return message;
  }

  @Mutation(_returns => ID)
  async deleteMessage(
    @Ctx() { callerId }: Context,
    @Arg('id') id: string,
    @PubSub() pubSub: PubSubEngine
  ): Promise<string> {
    const message = await this.repo.findOne({
      where: {
        id,
        sender: { id: callerId }
      },
      relations: ['messenger']
    });
    if (!message)
      throw new UserInputError(
        'No message found with this id, or user is not its sender'
      );

    const messengerId = (await message.messenger).id;

    await this.repo.delete(id);

    await pubSub.publish(MessageService.SubscriptionTopics.MessageDeleted, {
      messengerId,
      messageId: id
    });
    return id;
  }

  @Subscription(_returns => Message, {
    topics: MessageService.SubscriptionTopics.MessagePosted,
    filter: subscriptionsFilterFn
  })
  messagePosted(
    @Root() payload: { messengerId: string; message: Message },
    @Arg('messengerId', _type => ID) _messegerId: string
  ): Message {
    return payload.message;
  }

  @Subscription(_returns => Message, {
    topics: MessageService.SubscriptionTopics.MessageEdited,
    filter: subscriptionsFilterFn
  })
  messageEdited(
    @Root() payload: { messengerId: string; message: Message },
    @Arg('messegerId', _type => ID) _messengerId: string
  ): Message {
    return payload.message;
  }

  @Subscription(_returns => ID, {
    topics: MessageService.SubscriptionTopics.MessageDeleted,
    filter: subscriptionsFilterFn
  })
  messageDeleted(
    @Root() payload: { messengerId: string; messageId: string }
  ): string {
    return payload.messageId;
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
