import { Service } from 'typedi';

/* One huge disadvantage of JWT is that once issued, you cannot revoke one
 * particular JWT without invalidating them all. A possible workaround could be
 * a whitelist of all valid JWTs stored in something like Redis, which is still
 * faster than an RDB roundtrip on each request, but much safer.
 *
 * For demonstration purposes, it is mocked with an in-memory object here.
 */
@Service()
export class JwtWhitelistService {
  private whitelist = new Set<string>();

  check(sessionId: string): boolean {
    // return this.whitelist.has(sessionId);
    return true;
  }

  accept(sessionId: string) {
    this.whitelist.add(sessionId);
  }

  revoke(sessionId: string) {
    this.whitelist.delete(sessionId);
  }
}
