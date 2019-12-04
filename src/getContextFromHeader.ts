import { ApolloError } from 'apollo-server-express';
import { JwtWhitelistService } from 'auth/services/JwtWhitelistService';
import { Context } from 'Context';
import { verify as verifyCB } from 'jsonwebtoken';
import { Container } from 'typedi';
import { promisify } from 'util';

const verify = promisify<string, string, undefined, Context>(verifyCB);

const PREFIX = 'Bearer ';
const PREFIX_LENGTH = PREFIX.length;
const SECRET = process.env.JWT_SECRET!;

export const getContextFromHeader = async (
  header: string | undefined
): Promise<Context | null> => {
  if (header === undefined || !header.startsWith(PREFIX)) return null;
  const token = header.substr(PREFIX_LENGTH);
  const context = await verify(token, SECRET, undefined);
  if (!Container.get(JwtWhitelistService).check(context.sessionId))
    throw new ApolloError('Session has expired');
  return context;
};
