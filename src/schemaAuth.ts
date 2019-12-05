import { Context } from 'Context';
import { rule, shield } from 'graphql-shield';

const allowEveryone = rule('allowEveryone')(() => true);
const isAuthenticated = rule('isAuthenticated')((_, _args, ctx: Context) => {
  return ctx.callerId !== undefined;
});

export const schemaAuth = shield({
  Query: {
    '*': isAuthenticated
  },
  Mutation: {
    '*': isAuthenticated,
    signUp: allowEveryone,
    logIn: allowEveryone,
    refreshAccessToken: allowEveryone
  },
  Subscription: {
    '*': isAuthenticated
  }
});
