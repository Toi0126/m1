import { a, defineData, type ClientSchema } from '@aws-amplify/backend';

const schema = a
  .schema({
    Event: a
      .model({
        title: a.string().required(),
      })
      .authorization((allow) => [allow.guest()]),

    Candidate: a
      .model({
        eventId: a.id().required(),
        name: a.string().required(),
        totalScore: a.integer().required(),
      })
      .secondaryIndexes((index) => [index('eventId').queryField('listCandidatesByEvent')])
      .authorization((allow) => [allow.guest()]),

    Participant: a
      .model({
        eventId: a.id().required(),
        voterId: a.string().required(),
        displayName: a.string().required(),
      })
      .secondaryIndexes((index) => [index('eventId').queryField('listParticipantsByEvent')])
      .authorization((allow) => [allow.guest()]),

    Vote: a
      .model({
        eventId: a.id().required(),
        candidateId: a.id().required(),
        voterId: a.string().required(),
        score: a.integer().required(),
      })
      .secondaryIndexes((index) => [
        index('eventId').queryField('listVotesByEvent'),
        index('eventId').sortKeys(['voterId']).queryField('listVotesByEventAndVoter'),
      ])
      .authorization((allow) => [allow.guest()]),
  });

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'identityPool',
  },
});
