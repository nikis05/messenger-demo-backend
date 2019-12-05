import { ApolloError, AuthenticationError } from 'apollo-server-express';
import { JwtWhitelistService } from 'auth/services/JwtWhitelistService';
import { Context } from 'Context';
import { verify as verifyCB } from 'jsonwebtoken';
import { Container } from 'typedi';
import { promisify } from 'util';

const verify = promisify<string, string, undefined, Context & { iat: number }>(
  verifyCB
);

const PREFIX = 'Bearer ';
const PREFIX_LENGTH = PREFIX.length;
const SECRET = process.env.JWT_SECRET!;

export const getContextFromHeader = async (
  header: string | undefined
): Promise<Context | null> => {
  if (header === undefined || !header.startsWith(PREFIX)) return null;
  const token = header.substr(PREFIX_LENGTH);
  const decoded = await verify(token, SECRET, undefined);
  if (decoded.iat < Math.floor(new Date().getTime() / 1000) - 60 * 15)
    throw new AuthenticationError('Token refresh required');

  if (!Container.get(JwtWhitelistService).check(decoded.sessionId))
    throw new AuthenticationError('Session has expired');

  return decoded;
};
