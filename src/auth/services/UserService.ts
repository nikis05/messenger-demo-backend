import { ApolloError, UserInputError } from 'apollo-server-express';
import { UserCreateInput } from 'auth/inputs/UserCreateInput';
import { Session } from 'auth/models/Session';
import { Tokens } from 'auth/models/Tokens';
import { User } from 'auth/models/User';
import { compare, hash } from 'bcryptjs';
import { Context } from 'Context';
import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { JwtWhitelistService } from './JwtWhitelistService';
import { SessionService } from './SessionService';

const BCRYPTJS_SALT_ROUNDS = 10;

@Service()
@Resolver(_of => User)
export class UserService {
  @InjectRepository(User) private repo!: Repository<User>;
  @Inject(_service => SessionService) private sessionService!: SessionService;
  @Inject(_service => JwtWhitelistService)
  private jwtWhitelistService!: JwtWhitelistService;

  @Query(_returns => User, { description: "Returns caller's account metadata" })
  async self(@Ctx() { callerId }: Context): Promise<User> {
    const user = await this.repo.findOneOrFail(callerId);
    return user;
  }

  @Mutation(_returns => Tokens, {
    description: 'Registers new user in the system'
  })
  async signUp(
    @Arg('input', { description: 'Data of created user' })
    input: UserCreateInput
  ): Promise<Tokens> {
    const user = this.repo.create(input);
    user.saltedPassword = await UserService.saltPassword(input.password);
    await this.repo.save(user);

    return this.sessionService.openSession(user);
  }

  @Mutation()
  async logIn(
    @Arg('login') login: string,
    @Arg('password') password: string
  ): Promise<Tokens> {
    const user = await this.repo.findOne({ login });
    if (!user) throw new UserInputError('No user found with this login');

    await UserService.verifyPassword(user, password);

    await this.sessionService.terminateOutdatedSessions(user);

    return this.sessionService.openSession(user);
  }

  @Mutation()
  async changePassword(
    @Arg('oldPassword') oldPassword: string,
    @Arg('newPassword') newPassword: string,
    @Ctx() { callerId }: Context
  ): Promise<boolean> {
    const user = await this.repo.findOneOrFail(callerId);
    await UserService.verifyPassword(user, oldPassword);

    user.saltedPassword = await UserService.saltPassword(newPassword);
    await this.repo.save(user);
    return true;
  }

  @Mutation()
  async deleteAccount(
    @Arg('password') password: string,
    @Ctx() { callerId }: Context
  ): Promise<boolean> {
    const user = await this.repo.findOneOrFail(callerId, {
      relations: ['sessions']
    });
    await UserService.verifyPassword(user, password);

    (user.sessions as Session[]).forEach(session =>
      this.jwtWhitelistService.revoke(session.id)
    );

    await this.repo.remove(user);
    return true;
  }

  findByIds(ids: string[]) {
    return this.repo.findByIds(ids);
  }

  static saltPassword(password: string): Promise<string> {
    return hash(password, BCRYPTJS_SALT_ROUNDS);
  }

  static async verifyPassword(user: User, password: string): Promise<void> {
    const result = await compare(password, user.saltedPassword);
    if (!result) throw new UserInputError('Invalid password');
  }
}
