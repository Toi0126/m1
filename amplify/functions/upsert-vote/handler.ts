import type { Schema } from '../../data/resource';

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';

const ddb = new DynamoDBClient({});

type IdentityLike = {
  cognitoIdentityId?: string;
  cognito_identity_id?: string;
  sub?: string;
  username?: string;
};

function requiredEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getVoterId(identity: unknown): string {
  const id = (identity ?? {}) as IdentityLike;
  return (
    id.cognitoIdentityId ||
    id.cognito_identity_id ||
    id.sub ||
    id.username ||
    'unknown'
  );
}

export const handler: Schema['upsertVote']['functionHandler'] = async (event) => {
  const voteTableName = requiredEnv('VOTE_TABLE_NAME');
  const candidateTableName = requiredEnv('CANDIDATE_TABLE_NAME');

  const { eventId, candidateId, score } = event.arguments;
  const voterId = getVoterId((event as any).identity);

  const normalizedScore = Math.trunc(Number(score));
  if (!Number.isFinite(normalizedScore) || normalizedScore < 0 || normalizedScore > 100) {
    throw new Error('score must be an integer 0-100');
  }

  const voteId = `${eventId}#${candidateId}#${voterId}`;

  // 1) Read existing vote to compute delta.
  const oldResp = await ddb.send(
    new GetItemCommand({
      TableName: voteTableName,
      Key: { id: { S: voteId } },
      ConsistentRead: true,
      ProjectionExpression: 'id, score, createdAt',
    })
  );

  const oldScore = oldResp.Item?.score?.N ? Number(oldResp.Item.score.N) : 0;
  const createdAt = oldResp.Item?.createdAt?.S ?? nowIso();
  const delta = normalizedScore - oldScore;

  const ts = nowIso();

  // 2) Apply vote update + candidate totalScore update atomically.
  if (oldResp.Item) {
    await ddb.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Update: {
              TableName: voteTableName,
              Key: { id: { S: voteId } },
              UpdateExpression: 'SET score = :newScore, updatedAt = :ts',
              ConditionExpression: 'attribute_exists(id) AND score = :oldScore',
              ExpressionAttributeValues: {
                ':newScore': { N: String(normalizedScore) },
                ':oldScore': { N: String(oldScore) },
                ':ts': { S: ts },
              },
            },
          },
          {
            Update: {
              TableName: candidateTableName,
              Key: { id: { S: candidateId } },
              UpdateExpression: 'ADD totalScore :delta SET updatedAt = :ts',
              ExpressionAttributeValues: {
                ':delta': { N: String(delta) },
                ':ts': { S: ts },
              },
            },
          },
        ],
      })
    );
  } else {
    await ddb.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: voteTableName,
              Item: {
                id: { S: voteId },
                eventId: { S: eventId },
                candidateId: { S: candidateId },
                voterId: { S: voterId },
                score: { N: String(normalizedScore) },
                createdAt: { S: createdAt },
                updatedAt: { S: ts },
              },
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
          {
            Update: {
              TableName: candidateTableName,
              Key: { id: { S: candidateId } },
              UpdateExpression: 'ADD totalScore :delta SET updatedAt = :ts',
              ExpressionAttributeValues: {
                ':delta': { N: String(delta) },
                ':ts': { S: ts },
              },
            },
          },
        ],
      })
    );
  }

  // 3) Return updated Candidate (so subscription payload contains required fields).
  const candResp = await ddb.send(
    new GetItemCommand({
      TableName: candidateTableName,
      Key: { id: { S: candidateId } },
      ConsistentRead: true,
    })
  );

  const item = candResp.Item;
  if (!item) throw new Error('candidate not found');

  return {
    id: item.id.S as string,
    eventId: item.eventId.S as string,
    name: item.name.S as string,
    totalScore: Number(item.totalScore.N ?? '0'),
    createdAt: item.createdAt.S as string,
    updatedAt: item.updatedAt.S as string,
  };
};
