import { ApolloServer } from 'apollo-server-express';
import * as express from 'express';
import { getContextFromHeader } from 'getContextFromHeader';
import { applyMiddleware } from 'graphql-middleware';
import { createServer, IncomingMessage } from 'http';
import { pubSub } from 'pubSub';
import { schemaAuth } from 'schemaAuth';
import { buildSchemaSync } from 'type-graphql';
import { Container } from 'typedi';
import { createConnection, getConnectionOptions, useContainer } from 'typeorm';

useContainer(Container);

const schema = buildSchemaSync({
  resolvers: [
    __dirname +
      (process.env.NODE_ENV === 'production'
        ? '/*/services/*.js'
        : '/*/services/*.ts')
  ],
  emitSchemaFile: true,
  container: Container,
  pubSub
});

const apollo = new ApolloServer({
  schema: applyMiddleware(schema, schemaAuth),
  context: ({ req }: { req: IncomingMessage }) => {
    return getContextFromHeader(req.headers.authorization);
  },
  subscriptions: {
    onConnect: async connectionParams =>
      getContextFromHeader((connectionParams as any).Authorization)
  }
});

const app = express();
apollo.applyMiddleware({ app, path: '/graphql' });
const server = createServer(app);
apollo.installSubscriptionHandlers(server);

const bootstrap = async () => {
  const connectionOptions = await getConnectionOptions();
  if (process.env.NODE_ENV === 'production')
    Object.assign(connectionOptions, {
      entities: ['./dist/**/models/*.js']
    });
  await createConnection(connectionOptions);

  server.listen(process.env.PORT!, () => {
    console.log('🚀 Messenger backend successfully started');
  });
};

bootstrap();
