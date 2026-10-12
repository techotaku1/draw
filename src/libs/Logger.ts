import type { AsyncSink } from '@logtape/logtape';
import {
  configure,
  fromAsyncSink,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
} from '@logtape/logtape';
import { Env } from './Env';

const betterStackSink: AsyncSink = async (record) => {
  await fetch(`https://${Env.NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN}`,
    },
    body: JSON.stringify(record),
  });
};

const canForwardToBetterStack =
  Boolean(Env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN) &&
  Boolean(Env.NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST);

await configure({
  // LogTape refuses a second `configure` call, and in development this module
  // is re-evaluated on every hot reload. Without this flag the second
  // evaluation throws `ConfigError: Already configured`, which propagates out
  // of the import and makes every route that logs answer 500 until the server
  // is restarted by hand. Resetting is safe: the configuration below is the
  // whole of it, so re-applying it rebuilds exactly the same sinks.
  reset: true,
  sinks: {
    console: getConsoleSink({ formatter: getJsonLinesFormatter() }),
    betterStack: fromAsyncSink(betterStackSink),
  },
  loggers: [
    {
      category: ['logtape', 'meta'],
      sinks: ['console'],
      lowestLevel: 'warning',
    },
    {
      category: ['app'],
      sinks: canForwardToBetterStack ? ['console', 'betterStack'] : ['console'],
      lowestLevel: Env.NEXT_PUBLIC_LOGGING_LEVEL,
    },
  ],
});

export const logger = getLogger(['app']);
