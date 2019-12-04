import { ApolloServer, PubSub } from 'apollo-server-express';
import * as express from 'express';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { buildSchemaSync } from 'type-graphql';
import { Container } from 'typedi';
import { createConnection, getConnectionOptions, useContainer } from 'typeorm';
import { getContextFromHeader } from 'getContextFromHeader';

useContainer(Container);
const pubSub = new PubSub();

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
  schema,
  context: ({ req }: { req: IncomingMessage }) =>
    getContextFromHeader(req.headers.authorization)
});

const app = express();
apollo.applyMiddleware({ app, path: '/graphql' });
const server = createServer(app);

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
