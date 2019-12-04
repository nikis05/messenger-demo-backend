import { ForbiddenError, UserInputError } from 'apollo-server-express';
import { UserCreateInput } from 'auth/inputs/UserCreateInput';
import { Tokens } from 'auth/models/Tokens';
import { User } from 'auth/models/User';
import { compare, hash } from 'bcryptjs';
import { Context } from 'Context';
import { Arg, Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Repository, In } from 'typeorm';
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

  @Query(_returns => User, { nullable: true })
  async user(@Arg('login') login: string): Promise<User | null> {
    const user = await this.repo.findOne({ login });
    return user || null;
  }

  @Mutation(_returns => Tokens, {
    description: 'Registers new user in the system'
  })
  async signUp(
    @Arg('input', { description: 'Data of created user' })
    input: UserCreateInput
  ): Promise<Tokens> {
    const existingUsersWithLoginCount = await this.repo.count({
      login: input.login
    });
    if (existingUsersWithLoginCount !== 0)
      throw new ForbiddenError('A user with this login already exists');

    const user = this.repo.create(input);
    user.saltedPassword = await UserService.saltPassword(input.password);
    await this.repo.save(user);

    return this.sessionService.openSession(user);
  }

  @Mutation(_returns => Tokens)
  async logIn(
    @Arg('login') login: string,
    @Arg('password') password: string
  ): Promise<Tokens> {
    const user = await this.repo.findOne(
      { login },
      { relations: ['sessions'] }
    );
    if (!user) throw new UserInputError('No user found with this login');

    await UserService.verifyPassword(user, password);

    await this.sessionService.terminateOutdatedSessions(await user.sessions);

    return this.sessionService.openSession(user);
  }

  @Mutation(_returns => Boolean)
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

  @Mutation(_returns => Boolean)
  async deleteAccount(
    @Arg('password') password: string,
    @Ctx() { callerId }: Context
  ): Promise<boolean> {
    const user = await this.repo.findOneOrFail(callerId, {
      relations: ['sessions']
    });
    await UserService.verifyPassword(user, password);

    const sessions = await user.sessions;

    sessions.forEach(session => this.jwtWhitelistService.revoke(session.id));

    await this.repo.remove(user);
    return true;
  }

  findOne(id: string): Promise<User> {
    return this.repo.findOneOrFail(id);
  }

  async findMany(ids: string[]): Promise<User[]> {
    const users = await this.repo.find({ id: In(ids) });
    if (users.length !== ids.length)
      throw new UserInputError('No users found for provided ids');
    return users;
  }

  static saltPassword(password: string): Promise<string> {
    return hash(password, BCRYPTJS_SALT_ROUNDS);
  }

  static async verifyPassword(user: User, password: string): Promise<void> {
    const result = await compare(password, user.saltedPassword);
    if (!result) throw new UserInputError('Invalid password');
  }
}
