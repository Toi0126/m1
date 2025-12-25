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

const voteTableName = backend.data.resources.tables['Vote'].tableName;
const candidateTableName = backend.data.resources.tables['Candidate'].tableName;

backend.upsertVote.addEnvironment('VOTE_TABLE_NAME', voteTableName);
backend.upsertVote.addEnvironment('CANDIDATE_TABLE_NAME', candidateTableName);

backend.data.resources.tables['Vote'].grantReadWriteData(backend.upsertVote.resources.lambda);
backend.data.resources.tables['Candidate'].grantReadWriteData(backend.upsertVote.resources.lambda);
