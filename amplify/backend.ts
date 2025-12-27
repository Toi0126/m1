import { defineBackend } from '@aws-amplify/backend';

import { auth } from './auth/resource';
import { data } from './data/resource';
import { upsertVote } from './functions/upsert-vote/resource';

export const backend = defineBackend({
  auth,
  data,
  upsertVote,
});

// Guest access (unauthenticated role) is enabled by default in Amplify Gen 2.
// This app intentionally relies on guest IAM (Identity Pool) for MVP.

// Wire function <-> data tables for atomic vote upsert + totalScore aggregation.
const voteTable = backend.data.resources.tables['Vote'];
const candidateTable = backend.data.resources.tables['Candidate'];

backend.upsertVote.addEnvironment('VOTE_TABLE_NAME', voteTable.tableName);
backend.upsertVote.addEnvironment('CANDIDATE_TABLE_NAME', candidateTable.tableName);

voteTable.grantReadWriteData(backend.upsertVote.resources.lambda);
candidateTable.grantReadWriteData(backend.upsertVote.resources.lambda);
