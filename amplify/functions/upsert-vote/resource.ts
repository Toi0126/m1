import { defineFunction } from '@aws-amplify/backend';

export const upsertVote = defineFunction({
  name: 'upsert-vote',
  entry: './handler.ts',
});
