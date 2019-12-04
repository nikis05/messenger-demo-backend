import { Session } from 'auth/models/Session';
import { Tokens } from 'auth/models/Tokens';
import { User } from 'auth/models/User';
import { Context } from 'Context';
import { randomBytes as randomBytesCB } from 'crypto';
import { sign as signCB } from 'jsonwebtoken';
import { Ctx, Mutation, Query, Resolver } from 'type-graphql';
import { Inject, Service } from 'typedi';
import { Not, Repository } from 'typeorm';
import { InjectRepository } from 'typeorm-typedi-extensions';
import { promisify } from 'util';
import { JwtWhitelistService } from './JwtWhitelistService';

const { JWT_SECRET } = process.env;

const randomBytes = promisify(randomBytesCB);
const sign = promisify<Context, string, string>(signCB);

@Service()
@Resolver(_of => Session)
export class SessionService {
  @InjectRepository(Session) private repo!: Repository<Session>;
  @Inject(_service => JwtWhitelistService)
  private jwtWhitelistService!: JwtWhitelistService;

  @Query(_returns => [Session], {
    description: "Returns the list of all caller's active sessions"
  })
  sessions(@Ctx() { callerId }: Context): Promise<Session[]> {
    return this.repo.find({ where: { user: { id: callerId } } });
  }

  @Mutation(_returns => Session, {
    description:
      "Closes all caller's active sessions except current one. " +
      'To close current session, use logOut instead. ' +
      'Returns the remaining (active) session'
  })
  async closeAllSessionsExceptCurrent(
    @Ctx() { callerId, sessionId }: Context
  ): Promise<Session> {
    await this.repo.delete({ user: { id: callerId }, id: Not(sessionId) });
    return this.repo.findOneOrFail(sessionId);
  }

  @Mutation(_returns => Boolean, { description: 'Logs caller out' })
  async logOut(@Ctx() { sessionId }: Context): Promise<boolean> {
    await this.closeSession(sessionId);
    return true;
  }

  async openSession(user: User): Promise<Tokens> {
    const refreshToken = await SessionService.generateRefreshToken();

    const session = this.repo.create();
    session.refreshToken = refreshToken;
    session.user = user;

    await this.repo.save(session);
    this.jwtWhitelistService.accept(session.id);

    const accessToken = await SessionService.generateAccessToken({
      callerId: user.id,
      sessionId: session.id
    });
    return { refreshToken, accessToken };
  }

  async closeSession(id: string): Promise<void> {
    this.jwtWhitelistService.revoke(id);
    await this.repo.delete({ id });
  }

  async terminateOutdatedSessions(sessions: Session[]): Promise<void> {
    if (sessions.length < 5) return;
    const oldestSession = sessions.reduce((currentOldest, currentChecked) => {
      return currentOldest.lastUsed.getTime() >
        currentChecked.lastUsed.getTime()
        ? currentChecked
        : currentOldest;
    }, sessions[0]);

    await this.closeSession(oldestSession.id);
  }

  static async generateRefreshToken(): Promise<string> {
    const bytes = await randomBytes(256);
    return bytes.toString('hex');
  }

  static generateAccessToken(ctx: Context): Promise<string> {
    return sign(ctx, JWT_SECRET!);
  }
}
